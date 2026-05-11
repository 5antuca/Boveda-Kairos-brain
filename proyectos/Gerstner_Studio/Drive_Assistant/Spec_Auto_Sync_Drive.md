---
tags: [gerstner-studio, drive-assistant, spec, sync, mejora]
fecha: 2026-05-09
estado: PROPUESTO — pendiente implementación
relacionado: [[Drive_Assistant]], [[Spec_Original]], [[Decisiones_Pendientes]]
---

# Spec — Auto-sync de cambios en Drive

## El problema

Hoy el bot **no se entera de cambios en Google Drive automáticamente**. Si
Andreas (o cualquiera del taller) sube fotos nuevas, crea/renombra carpetas o
borra archivos, esos cambios **nunca aparecen** en la AI hasta que alguien
le pega manualmente al endpoint admin.

### Estado actual del pipeline de datos

Dos colecciones Mongo persisten datos de Drive:

| Colección | Qué guarda | Cómo se actualiza hoy |
|---|---|---|
| `folder_tree` | Árbol completo de carpetas (folder_id, path, name, depth) | Solo manualmente via `POST /admin/index-drive` |
| `folder_cache` | Listado de archivos por carpeta (id, name, mime, thumbnail_base) | Lazy en query — se llena la primera vez que alguien busca esa carpeta. TTL real de 45 min (chequeo en `check_cache.py` + índice TTL Mongo en `expires_at`). El límite viene de la validez del `thumbnailLink` firmado de Drive (~1h). |
| `thumbnail_cache` | Bytes de thumbnails proxy-eados | TTL real 7 días (sí se respeta) |

### Tabla de impacto

| Cambio en Drive | Aparece en la AI hoy? |
|---|---|
| Carpeta nueva | ❌ Hasta reindex manual |
| Renombrás carpeta | ❌ Mismo, queda con path viejo |
| Foto nueva en carpeta existente | ⚠️ Sirve cache viejo hasta 45 min (TTL real). Después se refetchea sola. |
| Borrás carpeta | ❌ Queda huérfana en `folder_tree` |
| Borrás foto | ❌ Sigue listada hasta limpiar `folder_cache` |
| Reemplazás foto (mismo file_id) | ⚠️ Lista nueva pero thumbnail cacheada vieja hasta 7 días |

### Por qué es bloqueante

El user está usando el bot diariamente para presentar el taller. Cualquier
foto que suba al Drive **no es buscable** hasta intervención técnica. Eso
mata el value-prop del producto: "todo el Drive, accesible por chat".

---

## Solución elegida — Cron interno cada 15 min + invalidación total

**Resolución del usuario (2026-05-09)**:
- **Latencia**: cron interno cada 10-15 min (APScheduler dentro del backend FastAPI).
- **Thumbnails**: invalidar todo cuando una foto cambia.

Razones para descartar las otras opciones:

| Opción descartada | Por qué |
|---|---|
| Stale-while-revalidate por query | La PRIMER query post-cambio sigue dando datos viejos. Mala UX si Andreas acaba de subir fotos y quiere mostrarlas en el momento. |
| Webhooks Drive (changes.watch) | Complejo: requiere endpoint público verificado, renovación de canales cada 7 días, manejo de duplicados, `startPageToken` persistente. Overkill para un Drive que se actualiza 1-2 veces por semana. |
| Polling incremental cada 2 min | Más eficiente que reindex completo, pero similar complejidad a webhooks (mantener `pageToken`, manejar deletes). El Drive actual no justifica la sofisticación. |

El cron simple es el sweet spot porque:
1. Drive se actualiza con frecuencia baja (semanas, no minutos).
2. Latencia 15 min es aceptable para una herramienta interna.
3. Cero infra nueva — APScheduler corre dentro del proceso FastAPI ya existente.
4. Reusa endpoints admin que ya existen.
5. Si después se necesita instantáneo, agregamos webhooks como capa adicional sin tirar esto.

---

## Diseño técnico

### 1. Scheduler dentro de FastAPI

Agregar `APScheduler` al `lifespan` de `main.py`. Job único cada 15 min:

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_indexes()
    # ... prewarm existente ...

    scheduler = AsyncIOScheduler(timezone="America/Argentina/Buenos_Aires")
    scheduler.add_job(
        sync_drive_job,
        trigger="interval",
        minutes=settings.DRIVE_SYNC_INTERVAL_MIN,  # default 15
        id="drive_sync",
        max_instances=1,        # nunca correr dos a la vez
        coalesce=True,          # si se atrasó, correr una sola vez
        next_run_time=datetime.now() + timedelta(minutes=2),  # primera corrida 2min post-startup
    )
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)
```

**Por qué APScheduler y no cron del host**:
- Todo dentro del container → fácil de debuggear con `docker logs`.
- Sobrevive reinicio del backend (próxima corrida arranca al startup + 2min).
- Sin dependencia de cron del VPS (que ya corre tareas de otros stacks).

### 2. La función `sync_drive_job`

```python
async def sync_drive_job():
    """
    Tarea periódica que reconcilia Mongo con el estado real de Drive.

    Pasos (en orden):
    1. Reindexar folder_tree (descubre carpetas nuevas / renombradas / borradas)
    2. Detectar deltas: carpetas borradas en Drive → marcar tombstone en Mongo
    3. Invalidar folder_cache de todas las carpetas que cambiaron
    4. Invalidar thumbnail_cache de archivos que cambiaron mtime
    5. Loggear métricas
    """
    started = datetime.utcnow()
    db = await get_db()

    # Snapshot pre-sync para diff
    before_folders = {f["folder_id"]: f for f in await db.folder_tree.find().to_list(None)}

    # Paso 1: reindex folder_tree
    drive_folders = await drive_service.list_folders_recursive(settings.DRIVE_ROOT_FOLDER_ID)
    drive_folder_ids = {f["folder_id"] for f in drive_folders}

    upserts = 0
    renamed_or_moved = []
    for f in drive_folders:
        old = before_folders.get(f["folder_id"])
        if not old or old.get("path") != f["path"]:
            renamed_or_moved.append(f["folder_id"])
        await db.folder_tree.replace_one(
            {"folder_id": f["folder_id"]},
            {**f, "updated_at": started},
            upsert=True,
        )
        upserts += 1

    # Paso 2: detectar carpetas borradas
    deleted_folder_ids = set(before_folders.keys()) - drive_folder_ids
    if deleted_folder_ids:
        await db.folder_tree.delete_many({"folder_id": {"$in": list(deleted_folder_ids)}})
        await db.folder_cache.delete_many({"folder_id": {"$in": list(deleted_folder_ids)}})

    # Paso 3: invalidar folder_cache de carpetas con cambios estructurales
    if renamed_or_moved:
        await db.folder_cache.delete_many({"folder_id": {"$in": renamed_or_moved}})

    # Paso 4: invalidación de archivos por mtime
    # Para cada folder cacheado, comparar el max(modifiedTime) de Drive vs el
    # cached_at de Mongo. Si Drive tiene archivos modificados después de
    # cached_at → invalidar ese folder_cache + thumbnails de los archivos.
    invalidated_files = await invalidate_changed_files(db)

    elapsed = (datetime.utcnow() - started).total_seconds()
    print(
        f"[drive_sync] folders={upserts} new={len(drive_folder_ids - set(before_folders))} "
        f"deleted={len(deleted_folder_ids)} renamed={len(renamed_or_moved)} "
        f"files_invalidated={invalidated_files} elapsed={elapsed:.1f}s"
    )
```

### 3. Invalidación de archivos por `modifiedTime`

`drive.files.list` ya devuelve `modifiedTime` (ISO 8601). Usar ese campo:

```python
async def invalidate_changed_files(db) -> int:
    """
    Para cada folder en folder_cache, pedir a Drive el max(modifiedTime)
    actual y comparar con cached_at. Si Drive tiene cambios → invalidar.
    """
    invalidated = 0
    cached_folders = await db.folder_cache.find(
        {}, {"folder_id": 1, "cached_at": 1, "files": 1}
    ).to_list(None)

    for cf in cached_folders:
        # Pedir solo metadata mínima (1 página, ordenado por modifiedTime DESC)
        fresh = await drive_service.list_files_max_modified(cf["folder_id"])
        if fresh and fresh > cf["cached_at"]:
            # Invalidar: borrar entry de folder_cache → próxima query re-fetchea
            await db.folder_cache.delete_one({"folder_id": cf["folder_id"]})
            # Invalidar thumbnails de los files que estaban cacheados
            file_ids = [f["id"] for f in cf.get("files", [])]
            if file_ids:
                await db.thumbnail_cache.delete_many(
                    {"file_id": {"$in": file_ids}}
                )
            invalidated += 1

    return invalidated
```

Nuevo método en `drive_service.py`:

```python
def _list_files_max_modified_sync(self, folder_id: str) -> datetime | None:
    service = self._ensure_service()
    res = service.files().list(
        q=f"'{folder_id}' in parents and trashed = false",
        fields="files(modifiedTime)",
        orderBy="modifiedTime desc",
        pageSize=1,
    ).execute()
    files = res.get("files", [])
    if not files:
        return None
    return datetime.fromisoformat(files[0]["modifiedTime"].replace("Z", "+00:00")).replace(tzinfo=None)
```

Esto cuesta 1 call a Drive por carpeta cacheada por sync. Si hay 50 carpetas
cacheadas → 50 calls cada 15 min = 4800 calls/día. Drive API permite 1000
req/100s/user (gratis). Margen amplio.

### 4. Race conditions

**Problema**: Si justo cuando el cron está reindexando, llega una query del
user, ¿puede ver datos inconsistentes?

**Mitigación**:
- `replace_one(upsert=True)` por carpeta es atómico en Mongo.
- `delete_many` también atómico.
- El peor caso: una query atrapa folder_tree intermedio (algunas carpetas con
  path viejo, otras con path nuevo). Pero como el LLM elige por path
  *parcialmente*, igual va a matchear. Aceptable.
- `max_instances=1` en APScheduler garantiza que nunca corren dos syncs juntos.

### 5. Endpoint manual de "sync ahora"

Aunque haya cron, mantener (y mejorar) el endpoint admin para forzar sync
en cualquier momento. Útil para Andreas si subió algo y quiere verlo *ya*:

```python
@router.post("/sync-now", dependencies=[Depends(verify_admin)])
async def trigger_sync_now():
    result = await sync_drive_job()  # ejecuta inline, devuelve métricas
    return result
```

Y en el sidebar del frontend (que ya armamos), agregar un botón
"🔄 Sincronizar Drive ahora" cuando el user esté autenticado como admin.
**Fuera de scope de esta spec** — backlog en [[Decisiones_Pendientes]].

### 6. Variables de entorno nuevas

```bash
# .env.example
DRIVE_SYNC_INTERVAL_MIN=15        # cada cuántos minutos corre el cron
DRIVE_SYNC_ENABLED=true           # kill switch para apagar el cron sin redeploy
```

### 7. Métricas / observabilidad

Por ahora, logs estructurados al stdout (que `docker logs` agarra):

```
[drive_sync] folders=386 new=2 deleted=0 renamed=1 files_invalidated=4 elapsed=8.3s
```

Si después se necesita más profundidad, agregar a Mongo una collection
`sync_log` con un doc por corrida. Fuera de scope v1.

---

## Plan de ejecución

### Fase 1 — APScheduler básico (~1.5h)
- Agregar `apscheduler` a `requirements.txt`.
- Crear `app/services/sync_service.py` con `sync_drive_job()`.
- Wire en `main.py:lifespan`.
- Test manual: bajar el intervalo a 1 min, verificar logs cada minuto.
- Var de entorno `DRIVE_SYNC_INTERVAL_MIN` (default 15).

### Fase 2 — Detección de deltas (~1h)
- Implementar diff `before_folders` vs `drive_folders`.
- Detectar carpetas borradas → tombstone (delete) en `folder_tree` + `folder_cache`.
- Detectar carpetas renombradas/movidas → invalidar `folder_cache` de esa.

### Fase 3 — Invalidación por mtime (~1.5h)
- Nuevo método `drive_service.list_files_max_modified()`.
- `invalidate_changed_files()` que compara mtime vs cached_at por folder.
- Borrar `thumbnail_cache` asociadas.

### Fase 4 — Hardening (~1h)
- Kill switch via `DRIVE_SYNC_ENABLED=false`.
- Endpoint `/admin/sync-now` para ejecución manual.
- Verificar que `max_instances=1` realmente bloquea overlap (test forzando
  intervalo bajo + carga).
- ~~Fix bug: `check_cache.py` debería respetar `expires_at`~~ → **resuelto** en `Spec_Fix_Matching_y_Cache.md` (TTL ahora 45 min, chequeado en runtime + índice TTL Mongo).

**Total**: ~5 horas. Reversible 100% (apagar cron con env var, datos quedan).

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Drive API rate limit (1000 req/100s) | El cron hace ~50-400 calls por corrida. Margen 2x mínimo. Si crece el Drive, agregar backoff. |
| Carpetas con cientos de archivos → reindex lento | Hoy `list_folders_recursive` tarda ~3-5s para ~400 carpetas. No bloquea queries (corre async). |
| Token OAuth expira | El service ya refreshea automáticamente (`drive_service.py:65-68`). El cron simplemente fallaría hasta refresh. |
| Sync corre durante un deploy / reinicio | `max_instances=1` + `next_run_time=startup+2min` evitan overlap. Si el deploy mata mid-sync, próxima corrida limpia. |
| Apaga el cron por error y nadie se entera | Log al startup: `[lifespan] drive_sync scheduled every Xmin` o `disabled`. Visible en `docker logs`. |

---

## Acceptance criteria

- [ ] Subo una foto al Drive → en ≤15 min aparece al buscar la carpeta donde la subí.
- [ ] Creo una carpeta nueva en Drive → en ≤15 min el bot puede matchearla.
- [ ] Renombro una carpeta → en ≤15 min el path nuevo aparece, el viejo desaparece.
- [ ] Borro una foto → en ≤15 min deja de aparecer en queries (y su thumbnail también).
- [ ] Borro una carpeta → en ≤15 min `folder_tree` y `folder_cache` ya no la tienen.
- [ ] Endpoint `POST /admin/sync-now` ejecuta el sync inmediato y devuelve métricas.
- [ ] `DRIVE_SYNC_ENABLED=false` apaga el cron sin redeploy ni código modificado.
- [ ] `docker logs ai-gerstner-backend` muestra una línea por corrida con métricas.

---

## Backlog futuro (NO en esta spec)

- **Webhooks Drive**: si el user empieza a actualizar Drive >10 veces/día y la
  latencia de 15min molesta, agregar `changes.watch` como capa adicional. El
  cron queda como fallback.
- **Botón "Sync now" en sidebar**: integrar `/admin/sync-now` con un botón
  en el drawer del frontend (junto al "Conversación nueva").
- **Notificación "Drive actualizado"**: pequeño toast en frontend cuando el
  cron detectó cambios desde la última sesión del user.
- **Métricas en Mongo**: collection `sync_log` con histórico para detectar
  drift (ej. carpetas que crecen muy rápido, errores recurrentes).
