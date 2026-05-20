---
tags: [gerstner-werks, drive-assistant, v8, operacion, como-trabajar]
fecha: 2026-05-20
estado: LIVE — refleja main al 2026-05-20
---

# 🛠️ ai-gerstner v8 — Cómo trabajar

Guía operativa **actualizada** del agente que vive en
`ai.kairosaisolutions.com`. Reemplaza partes obsoletas de
[[Drive_Assistant]] / [[Funcionamiento]] que aún hablan de LangGraph,
chat REST `/chat`, dicotomía home/presentación, etc. Esos archivos
quedan como historia.

## TL;DR

- **Una sola pantalla**: la presentación es la app. Voz (push-to-talk
  espacio) + caja de texto siempre abajo.
- **Stack actual**: FastAPI + langchain (NO langgraph) + OpenAI
  Realtime STT + Service Account de Drive + MongoDB local.
- **Auth**: password compartida en cookie (`ACCESS_PASSWORD` en `.env`).
- **Multi-tenant**: hay scaffold pero todo está hardcoded a `default`
  (todos los devices comparten estado).
- **Editar aliases sin restart**: YAML hot-reload (ver abajo).
- **Reindexar doc o Drive**: botones en el menú 3-puntos de la UI.

## Estado del rework v8 (todo en main al 2026-05-20)

| Fase | Qué hizo | Commit |
|---|---|---|
| Bug fix | Chat de texto siempre responde | `dba6615` |
| A | Limpieza −2552 líneas (chat REST + langgraph + componentes muertos) | `98e2ac6` |
| B | Botón "Actualizar documentación (chat IA)" en el menú Drive | `1b2d0bc` |
| C | Scaffold multi-tenant: colección `tenants` + resolver `default` | `3fbaf9e` |
| D | Hot-reload de aliases del perfil flat vía YAML | `fc4c511` |

## Editar aliases (hot-reload, sin restart)

**Archivo único**:
`/root/apps/ai-gerstner/config/aliases/presentacion_flat.yaml`

Estructura:
- `extra_aliases`: slug → lista de frases naturales
- `wrapper_slugs`: slugs cuyos descendientes se muestran si se nombran
  genéricos (ej. "el motor" → todo el vano)
- `vista_slug`: wrapper slug → código de vista (hereda frases
  direccionales)

**Para agregar un alias a una pieza existente**:

```yaml
extra_aliases:
  vano_motor:
    - motor
    - el motor
    - <tu frase nueva acá>
```

Pasos:
1. SSH al VPS o editar via tu editor
2. Guardar
3. Listo. La próxima sesión que arranque el agente ve el alias.

Verificar:
```bash
docker logs ai-gerstner-backend --tail 20 | grep aliases_loader
# Debería loggear: [aliases_loader] reload presentacion_flat.yaml: N aliases...
```

**No requiere rebuild ni restart**. El loader chequea mtime y re-lee si
cambió. Las sesiones ya abiertas mantienen el snapshot del inicio.

## Agregar una sección opt-in nueva (carpeta plana)

Cuando creás una carpeta plana hermana a `Vistas/` (al lado de "Pieles
de carbono", "Carrocería sin pieles", "Porsche Verde (singer)",
"Porsche Gris (singer)") que SÓLO debe dispararse con una frase
canónica, hay que tocar **3 lugares** (rebuild requerido).

Ejemplo: querés agregar "Porsche Amarillo (singer)":

1. **YAML** (`config/aliases/presentacion_flat.yaml`):
   ```yaml
   extra_aliases:
     sec_amarillo:
       - porsche amarillo
   ```

2. **`backend/app/services/tree_profiles.py`**:
   - Agregar `"amarillo"` al set `_FLAT_OPT_IN_SECTIONS`
   - Agregar `"sec_amarillo"` al set `optin_slugs` dentro de
     `PresentacionFlatProfile.match_config()`

3. **`backend/app/routers/presentation.py`** (solo porque arranca con
   "porsche"):
   - Agregar `"porsche amarillo"` a la tupla `_SINGER_OPTIN_PHRASES`.
   - Razón: `match_vehicles("porsche X")` matchea todos los Porsches
     del índice y secuestra la frase antes de llegar al matcher de
     piezas. Esta lista la esquiva.

4. Rebuild + restart:
   ```bash
   cd /root/apps/ai-gerstner
   docker compose build backend && docker compose up -d backend
   ```

5. Indexar las fotos de la carpeta nueva:
   ```bash
   docker exec ai-gerstner-backend curl -s -X POST \
     http://localhost:8000/presentation/refresh-drive
   # o el botón "Actualizar Drive" en el menú UI
   ```

## Reindexar la documentación del taller (chat IA)

Cuando editás los docs de Procesos/Documentación en Drive:

- **UI**: botón **"Actualizar documentación (chat IA)"** en el menú
  3-puntos arriba derecha. Cookie auth (la misma de
  `ACCESS_PASSWORD`).
- **HTTP**:
  ```bash
  curl -X POST https://ai.kairosaisolutions.com/api/presentation/knowledge/reindex \
    -H "X-Access-Password: $ACCESS_PASSWORD"
  ```

Incremental por `modifiedTime` — solo re-chunkea los gdocs que
cambiaron. Idempotente, podés correrlo cuando quieras.

## Reindexar las fotos del Drive

Cuando subís fotos nuevas a Drive:

- **UI**: botón **"Actualizar contenido de Drive"** en el menú
  3-puntos.
- **HTTP**:
  ```bash
  curl -X POST https://ai.kairosaisolutions.com/api/presentation/refresh-drive
  ```

Hay un job automático cada 15 min en background, pero el botón es
inmediato.

## Multi-tenant (estado actual)

Los "tenants" hoy son **devices** distintos (mac, iPad, mobile, pcs
ajenas) del mismo usuario. Todos comparten Drive root, pins, doc, etc.

Hay scaffold en `backend/app/services/tenants.py`:
- Colección `tenants` con un único doc `default`
- `resolve_tenant_id(request) -> str` siempre devuelve `default`
- FastAPI dependency `current_tenant`

**Para sumar un cliente externo real**: editar `resolve_tenant_id()`
con la lógica que se decida (subdominio / path / header / cookie) y
empezar a filtrar las queries que correspondan por `tenant_id`. Las
colecciones globales hoy (`folder_tree`, `media_index`,
`vehicles_index`, `knowledge_chunks`, `pinned_images`) se mantienen
compartidas hasta que se decida lo contrario.

## Operación diaria

### Logs

```bash
docker compose logs -f backend   # WS, transcribe, extract, EMIT
docker compose logs -f frontend  # nginx
```

### Restart sin tocar código

```bash
docker compose restart backend
```

### Después de cambiar código backend

```bash
cd /root/apps/ai-gerstner
docker compose build backend && docker compose up -d backend
docker exec ai-gerstner-backend curl -fsS http://localhost:8000/health
```

### Después de cambiar frontend

```bash
docker compose build frontend && docker compose up -d frontend
# Si el navegador tiene cache vieja: Cmd+Shift+R
```

## Qué NO hacer

- **NO editar el YAML adentro del container** (`docker exec ... vi
  /app/config/...`). El volumen es read-only desde el container y los
  cambios se perderían al recrear el container. Editá en el host.
- **NO mezclar `optin_slugs` con `extra_aliases`**: `optin_slugs` es
  decisión de clasificación (cómo se construye el índice de piezas),
  no solo aliasing. Cambia en `tree_profiles.py`.
- **NO deployar backend en caliente sin smoke test**. El WS smoke
  test rápido es:
  ```bash
  docker exec ai-gerstner-backend python3 -c "
  import asyncio, json, httpx, websockets
  async def main():
      async with httpx.AsyncClient() as c:
          r = await c.post('http://localhost:8000/presentation/start',
                           json={'project':'singer'},
                           headers={'X-Access-Password': '5282'})
          sid = r.json()['sid']
      uri = f'ws://localhost:8000/presentation/ws/{sid}?t=5282'
      async with websockets.connect(uri) as ws:
          await asyncio.sleep(0.3)
          await ws.send(json.dumps({'type':'text_command','text':'porsche verde','history':[]}))
          for _ in range(10):
              m = json.loads(await asyncio.wait_for(ws.recv(), timeout=15))
              if m['type'] in ('piece_detected','vehicle_detected','knowledge_answer','no_match'):
                  print(m['type'], m.get('piece') or '')
                  break
  asyncio.run(main())
  "
  ```
- **NO olvidarse de `_SINGER_OPTIN_PHRASES`** cuando la frase opt-in
  arranca con "porsche". Sin esto el opt-in queda muteado por
  `match_vehicles`.

## Cambios estructurales pendientes

Discutidos en la sesión del 2026-05-20 pero NO implementados:

- **Aislamiento real por tenant** (cuando llegue un cliente externo):
  branding, ACCESS_PASSWORD, telemetría separada por tenant_id en
  Mongo.
- **Hot-reload de SPEECH_ALIASES legacy**: mover de Python a YAML.
  Costo no compensa hoy (se toca poco).
- **Drive push notifications** en vez del poll cada 15min: requiere
  endpoint HTTPS validado por Google + renovación periódica del
  channel. Pendiente hasta que el poll molesto.
- **Modo no-rioplatense en el prompt del chat IA**: hoy hardcoded en
  `_ANSWER_INSTRUCTIONS` (`knowledge_service.py`). Si llega un cliente
  no argentino, mover a YAML por tenant.
