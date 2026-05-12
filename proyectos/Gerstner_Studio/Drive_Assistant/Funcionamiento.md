---
tags: [gerstner-studio, drive-assistant, arquitectura, doc-vivo]
fecha-creacion: 2026-05-12
estado: ACTIVO — refleja lo que está deployado en https://ai.kairosaisolutions.com
relacionado: [[Drive_Assistant]], [[Vision_Analyzer]], [[Bot_Ordenador]], [[Metricas_Latencia]]
---

# Funcionamiento del Drive Assistant

		Doc explicativo de cómo funciona el bot que vive en `https://ai.kairosaisolutions.com`.
Pensado para alguien que entra a tocar el código sin contexto previo. Refleja
el estado **deployado al 2026-05-12**.

---

## 🎯 Objetivo

Permitir que el equipo de Gerstner Werks busque fotos y videos del Drive del
taller (Drive personal, ~5 GB, ~2000 archivos) usando lenguaje natural en
español. Reemplaza el "buscar manualmente N niveles de carpetas en el celular"
con un chat tipo ChatGPT que devuelve 12-20 thumbnails listos para ver.

Ejemplo:
- Usuario tipea: **"interior del singer"**
- Bot responde: *"Encontré 106 imágenes de Porsche Singer. Te muestro 20."* + grid de thumbnails.

Apunta al **sandbox** `1Kp4wPnKhZ-p3yj1dAdIbCJNw6i0KW5Qx` (copia controlada por
el usuario, no el Drive original del taller — ver [[Drive_Assistant#🔄 Switch a sandbox (2026-05-10)]]).

---

## 🏗️ Arquitectura física

```
┌──────────────────────┐
│  Frontend (React)    │  ai.kairosaisolutions.com
│  Vite + Tailwind     │  Auth: cookie gerstner_pwd
└──────────┬───────────┘
           │ POST /api/chat/
           ▼
┌──────────────────────┐
│  Backend (FastAPI)   │  container `ai-gerstner-backend`
│  LangGraph agent     │  Python 3.12 + langchain-openai
└─┬─────────┬──────────┘
  │         │
  ▼         ▼
┌──────┐  ┌──────────────┐       ┌────────────────────┐
│Mongo │  │OpenAI API    │       │Google Drive API v3 │
│(7)   │  │gpt-4.1-mini  │       │OAuth user-token    │
│local │  │+gpt-4o-mini  │       │read-only por ahora │
└──────┘  └──────────────┘       │(scope drive p/orden)│
                                  └────────────────────┘
```

- **Frontend**: SPA React, sirve grid + lightbox de imágenes/videos. Pasa por
  Traefik (subdominio `ai.kairosaisolutions.com`, cert LE auto-renovable).
- **Backend**: FastAPI corriendo el agente LangGraph. Único proceso async.
- **Mongo local**: `mongo:7` en container `ai-gerstner-mongo`, DB `gerstner_drive`.
  Persistencia con volumen Docker `mongo_data`.
- **OpenAI**: 2 modelos. `gpt-4.1-mini` para razonar (parse_intent, match_folders,
  generate_response). `gpt-4o-mini` para visión (taggear imágenes).
- **Google Drive**: OAuth con token del dueño (Santi). `token.json` montado
  como volumen, auto-refresh transparente.

---

## 🔑 La pregunta importante — ¿hay embeddings vectoriales?

**No.** El sistema **no usa embeddings ni vector search**. Lo que tiene es:

| Capa | Qué es | Cómo se busca |
|---|---|---|
| `folder_tree.path` | String "Porsche Singer/Marketing/Tablero" | Substring matching normalizado (sin tildes, lowercase) + scoring por peso |
| `folder_tree.vision_summary` | Dict de tags agregados de 5 muestras: `{colors:[...], parts:[...], materials:[...], fases:[...], carrocerias:[...], tags_libres:[...]}` | Substring matching del `visual_filter` del intent contra cada lista |
| `image_vision_cache` | Tags estructurados por archivo individual (los 5 sampleados) | **NO se consulta en query-time**. Existe solo para que `tag_folder` reuse el llamado a OpenAI si la imagen ya fue vista |

Las búsquedas son **estructuradas + texto**, no semánticas. "auto rojo descapotable
años 60" no funciona como búsqueda por similitud — el modelo se basa en
tokens literales que aparezcan en `path` o en los enums del `vision_summary`.

Para tener búsqueda semántica real haría falta:
- `text-embedding-3-small` por descripción de cada imagen, o
- CLIP directamente sobre los bytes.

Ambas guardadas en Mongo Atlas Vector Search o pgvector. Backlog, no implementado.

---

## 🌐 ¿De dónde sale la información?

Tres fuentes que se reconcilian en Mongo:

### 1. Google Drive (verdad de las carpetas y archivos)

El `drive_service.py` usa OAuth (token de Santi) para listar:
- `list_folders_recursive(root_id)` — devuelve todas las carpetas bajo el root
  con `folder_id`, `name`, `path`, `parent_id`, `depth`. Hasta depth 10.
- `list_files_in_folder(folder_id)` — devuelve archivos directos: `id`, `name`,
  `mimeType`, `thumbnailLink`, `webViewLink`, `modifiedTime`.

El `thumbnailLink` es una URL firmada de Drive (`lh3.googleusercontent.com/...`)
que vive ~1 hora. Después expira y devuelve 403. Por eso los caches tienen TTL
corto.

### 2. OpenAI vision (qué hay EN cada imagen)

`vision_service.analyze_image(file_id)`:
1. Baja el thumbnail =s400 (~30 KB) vía Drive API.
2. Lo manda a `gpt-4o-mini` con un prompt que pide JSON estructurado
   (color, carrocería, fase, parte_visible, material, tags_libres).
3. Guarda en `image_vision_cache` con `file_id` como llave única.

Costo: ~$0.001-0.002 USD por imagen. Sin TTL: la imagen no cambia, el tag
tampoco. Si querés re-tagear: `force=True` o `DELETE /api/admin/vision`.

`vision_service.tag_folder(folder_id, n_samples=5)` toma hasta 5 imágenes de
la carpeta, las analiza, y guarda el **agregado** en `folder_tree.vision_summary`
(top-3 colores, top-2 carrocerías, top-5 partes, etc.). Eso es lo que el
matcher usa después.

### 3. Tu query (intent)

Cuando vos tipeas "interior del singer", el `parse_intent` lo descompone en:

```json
{
  "project": "porsche singer",
  "media_type": "interior",
  "format": "any",
  "visual_filter": null,
  "keywords": ["interior", "singer"],
  "is_more_request": false,
  "raw_query": "interior del singer"
}
```

Eso es lo que viaja por todo el resto del grafo.

---

## 🔄 Flujo de un mensaje — paso a paso

```
POST /api/chat/  { query, session_id }
       │
       ▼
  auth.require_access  →  rechaza si la cookie/header no matchea ACCESS_PASSWORD
       │
       ▼
  chat.py — preprocesado
   • carga últimos N turnos de chat_sessions (CONTEXT_TURNS=1)
   • si la query es tipo "más" → reinyecta intent + matched_folder_ids del turno previo
       │
       ▼
  agent_graph.ainvoke(state)        ◄── LangGraph state machine
       │
       │  ┌─────────────────────────────────────────────────┐
       │  │  parse_intent                                    │
       │  │    LLM (gpt-4.1-mini) → JSON intent              │
       │  │    Aplica regla de herencia de contexto previo   │
       │  └────────┬────────────────────────────────────────┘
       │           ▼
       │  ┌─────────────────────────────────────────────────┐
       │  │  match_folders                                   │
       │  │    1. lee folder_tree de Mongo (124 carpetas)    │
       │  │    2. _prefilter por substring + scoring         │
       │  │       (raw_query=50, name_exact=40,              │
       │  │        project_full=30, project_token=6,         │
       │  │        keyword=2, depth_penalty=-0.5)            │
       │  │    3. anti-contaminación: filtra los que no      │
       │  │       matcheen al menos un project_token         │
       │  │    4. si intent.visual_filter → _score_visual    │
       │  │       contra vision_summary (parts/colors=+15,   │
       │  │       materials/fases=+8)                        │
       │  │    5. LLM final elige 1-3 folder_ids             │
       │  │       (le pasa path + vision compacto)           │
       │  └────────┬────────────────────────────────────────┘
       │           ▼
       │  ┌─────────────────────────────────────────────────┐
       │  │  check_cache                                     │
       │  │    por cada matched_folder_id:                   │
       │  │     - busca en folder_cache                      │
       │  │     - chequea expires_at                         │
       │  │    cache_hit = TRUE si TODAS están vivas         │
       │  └────────┬────────────────────────────────────────┘
       │           │
       │     ┌─────┴─────┐
       │     │           │
       │     HIT         MISS
       │     │           ▼
       │     │   ┌─────────────────────────────────────────┐
       │     │   │  search_drive                            │
       │     │   │   por cada folder_id:                    │
       │     │   │    - drive_service.list_files_in_folder  │
       │     │   │    - si vacío, baja 1 nivel y junta hijas│
       │     │   └────────┬────────────────────────────────┘
       │     │            ▼
       │     │   ┌─────────────────────────────────────────┐
       │     │   │  save_cache                              │
       │     │   │   upsert folder_cache con expires_at     │
       │     │   │   (now + 45 min, < TTL del thumbLink)    │
       │     │   └────────┬────────────────────────────────┘
       │     │            │
       │     └────────────┘
       │           ▼
       │  ┌─────────────────────────────────────────────────┐
       │  │  generate_response                               │
       │  │    1. Selección DETERMINÍSTICA hasta 20 imgs     │
       │  │       (filtro por visual_filter contra           │
       │  │       image_vision_cache si hay)                 │
       │  │    2. LLM chico (gpt-4.1-mini) compone TEXTO     │
       │  │       tipo agente: menciona el último segmento   │
       │  │       del path matcheado + ofrece 2-3 carpetas   │
       │  │       hermanas (siblings) o hijas (children)     │
       │  │       como alternativa cuando hay <15 fotos      │
       │  │       o el query era específico. Fallback a      │
       │  │       template estático si la llamada falla.     │
       │  └────────┬────────────────────────────────────────┘
       │           ▼
       └────  state final con text + images
       ▼
  chat.py — postprocesado
   • persiste turno en chat_sessions
   • emite log [timing] con métricas (parse_intent_ms, match_folders_ms, etc.)
   • prewarm thumbnails (descarga los primeros 6 al cache local de bytes)
   • devuelve JSON { session_id, text, images, cache_hit }
```

Latencias típicas (de [[Metricas_Latencia]]):
- **Cache HIT** (~600 ms): solo LLM final + serialización.
- **Cache MISS** (~2-3 s): LLM intent + LLM matcher + Drive API listing + LLM response.

---

## 🗄️ Schema de Mongo (`gerstner_drive`)

| Colección | Propósito | TTL | Tamaño aprox |
|---|---|---|---|
| `folder_tree` | Árbol de Drive (124 carpetas, una por carpeta real) | manual via reindex | ~150 KB |
| `folder_cache` | Listado de archivos por carpeta (con thumbnailLink firmado) | 45 min en `expires_at` (índice TTL Mongo) | varía |
| `image_vision_cache` | Tags por imagen individual (los 5 sampleados de cada carpeta = ~600 imgs) | infinito | ~500 KB |
| `thumbnail_cache` | Bytes de thumbnails proxy-eados desde Drive (para el endpoint `/api/thumbnail/{id}`) | 7 días | varía |
| `chat_sessions` | Historial de conversaciones (para herencia de contexto + admin debug) | infinito | varía |
| `drive_changes_log` | Audit log del Bot Ordenador (rename/move/delete) | infinito | varía |
| `ordenador_plans` | Planes dry-run del Bot Ordenador | infinito | varía |

### Documento típico de `folder_tree`

```json
{
  "folder_id": "1pbWEMuG-c6lgmpOZSOU2z7KmpfAxO1_N",
  "name": "Porsche 964 Gerstner Singer",
  "path": "Porsche 964 Gerstner Singer",
  "parent_id": "1Kp4wPnKhZ-p3yj1dAdIbCJNw6i0KW5Qx",
  "depth": 0,
  "updated_at": "2026-05-10T23:51:41Z",
  "vision_summary": {
    "colors": ["negro", "marron", "naranja"],
    "carrocerias": ["coupe"],
    "fases": ["interior", "terminado"],
    "materials": ["cuero", "metal"],
    "parts": ["interior", "asientos", "tablero", "volante"],
    "tags_libres": ["restauracion", "interior clasico", "porsche", "auto", "clasico"]
  },
  "vision_tagged_at": "2026-05-12T03:14:22Z",
  "vision_samples_count": 5
}
```

### Documento típico de `image_vision_cache`

```json
{
  "file_id": "19nl9iD_vrfYDA9cj-IZ89YdNQ40NMsMH",
  "tags": {
    "color_dominante": "marron",
    "carroceria": "coupe",
    "fase": "interior",
    "parte_visible": ["interior", "asientos", "tablero"],
    "material_dominante": "cuero",
    "tags_libres": ["porsche", "cuero", "tablero"]
  },
  "model": "gpt-4o-mini",
  "analyzed_at": "2026-05-12T03:14:18Z"
}
```

---

## 🔄 ¿Cómo se actualiza el folder_tree cuando cambia Drive?

**Automático cada 15 min** desde Chunk 8 (2026-05-12) — APScheduler corre
`sync_drive_job` dentro del proceso FastAPI. Apagable con
`DRIVE_SYNC_ENABLED=false` en `.env` (no requiere rebuild).

Detecta automáticamente:
- Carpetas nuevas → upsert en folder_tree + opcionalmente vision-tag (con
  `DRIVE_SYNC_RETAG_NEW=true`, default).
- Carpetas renombradas/movidas → invalida folder_cache para refetch.
- Carpetas borradas → delete de folder_tree + folder_cache (sin huérfanos).
- Log estructurado en `drive_sync_log` con métricas por corrida.

Trigger manual también disponible. Endpoints admin:

```bash
ADMIN=$(grep ADMIN_TOKEN /root/apps/ai-gerstner/.env | cut -d= -f2)

# Reindexar folder_tree completo (lee Drive recursivo, upsert por folder_id)
curl -X POST -H "Authorization: Bearer $ADMIN" \
  https://ai.kairosaisolutions.com/api/admin/index-drive

# Re-tagear carpetas que no tienen vision_summary (idempotente)
curl -X POST -H "Authorization: Bearer $ADMIN" \
  "https://ai.kairosaisolutions.com/api/admin/vision/tag-all?n_samples=5&only_missing=true"

# Forzar limpieza completa de vision (re-tag desde cero)
curl -X DELETE -H "Authorization: Bearer $ADMIN" \
  https://ai.kairosaisolutions.com/api/admin/vision

# Forzar sync inmediato (no esperar 15min)
curl -X POST -H "Authorization: Bearer $ADMIN" \
  https://ai.kairosaisolutions.com/api/admin/sync-now

# Ver histórico de las últimas N corridas del scheduler
curl -H "Authorization: Bearer $ADMIN" \
  "https://ai.kairosaisolutions.com/api/admin/sync-log?limit=20"
```

Variables de entorno relacionadas:

| Var | Default | Para qué |
|---|---|---|
| `DRIVE_SYNC_ENABLED` | `true` | Kill switch del scheduler sin rebuild |
| `DRIVE_SYNC_INTERVAL_MIN` | `15` | Cada cuántos minutos corre |
| `DRIVE_SYNC_RETAG_NEW` | `true` | Si carpetas nuevas se vision-taggean automático |

⚠️ **Carpetas borradas-y-recreadas (folder_id nuevo)**: el sync auto las
detecta y limpia. Esto resuelve el bug histórico de huérfanos (2026-05-12,
140 huérfanos por reindex no idempotente — ya no debería volver a pasar).

---

## 🔐 Auth — cómo entra el usuario

Una sola password compartida (`ACCESS_PASSWORD` en `.env`), tres formas de pasarla:

1. **Cookie HTTP-only** `gerstner_pwd` (1 año) — la principal, seteada al
   hacer `POST /auth/login`. Browser la manda sola en cada request.
2. **Header `Authorization: Bearer <pwd>`** — para curl / herramientas.
3. **Query string `?t=<pwd>`** — para magic links iniciales y para el endpoint
   de proxy de thumbnails.

⚠️ Históricamente había tokens por persona en Mongo `users`, pero se simplificó
a password compartida. Si el doc [[Como_Acceder]] menciona tokens individuales,
está desactualizado en ese punto.

---

## 🧰 Qué herramientas adicionales hay

Además del chat hay un **Bot Ordenador** ([[Bot_Ordenador]]) que **escribe en
Drive** (rename, move, create folder, delete dups). Comparte la mayoría de la
infra (OAuth, Mongo, classifier_service que usa vision tags) pero está separado
en endpoints `/api/admin/orden/...`. NO se dispara desde el chat — el operador
lo corre via curl, revisa el plan dry-run, y aprueba la ejecución.

---

## 🧪 Cómo probar que funciona

```bash
# Smoke test rápido — 5 queries golden
PWD=$(grep ACCESS_PASSWORD /root/apps/ai-gerstner/.env | cut -d= -f2)
for q in "interior del singer" "tablero shelby cobra" "motor ferrari" \
         "jaguar amarillo" "fotos del bronco"; do
  echo "=== $q ==="
  curl -s -X POST -H "Authorization: Bearer $PWD" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"$q\",\"session_id\":\"smoke-$RANDOM\"}" \
    https://ai.kairosaisolutions.com/api/chat/ \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('text','')[:120]); print('  images:', len(d.get('images') or []))"
done
```

Baseline esperado (post cleanup 2026-05-12): 4 de 5 devuelven >0 imágenes.
"asientos cuero" falla porque es query sin proyecto — gap conocido que se
resolverá con per-file vision (Opción A futura).

---

## 🩺 Diagnóstico cuando algo no aparece

Pasos en orden:

1. ¿La carpeta está en `folder_tree`?
   ```bash
   docker exec ai-gerstner-mongo mongosh gerstner_drive --quiet --eval \
     'db.folder_tree.find({path: /singer/i}, {_id:0, path:1, depth:1, vision_samples_count:1}).limit(10).forEach(printjson)'
   ```

2. ¿Tiene `vision_summary`?
   ```bash
   docker exec ai-gerstner-mongo mongosh gerstner_drive --quiet --eval \
     'db.folder_tree.findOne({path: /singer/i}, {_id:0, path:1, vision_summary:1})'
   ```

3. ¿Hay huérfanos? (folder_ids en Mongo que ya no existen en Drive)
   ```bash
   docker exec ai-gerstner-backend python3 -c "
   import asyncio
   from app.services.drive_service import drive_service
   from app.database import get_db
   async def main():
       drive_ids = {f['folder_id'] for f in await drive_service.list_folders_recursive('1Kp4wPnKhZ-p3yj1dAdIbCJNw6i0KW5Qx')}
       db = await get_db()
       mongo = await db.folder_tree.find({}, {'folder_id':1, 'path':1}).to_list(None)
       orphans = [m for m in mongo if m['folder_id'] not in drive_ids]
       print(f'Drive: {len(drive_ids)}  Mongo: {len(mongo)}  Huérfanos: {len(orphans)}')
   asyncio.run(main())"
   ```

4. ¿Los logs muestran error en algún nodo?
   ```bash
   docker logs ai-gerstner-backend --tail 200 2>&1 | grep -E "timing|error"
   ```

5. Métricas detalladas: ver [[Metricas_Latencia]].

---

## 🚧 Gaps conocidos al 2026-05-12

| Gap | Cómo se manifiesta | Cuándo lo arreglamos |
|---|---|---|
| Bot ofrece carpetas pero el "sí" no es un botón | Si el bot ofrece "tapizado de techo" y respondés "sí pasame esas", el `parse_intent` lo trata como query nueva — funciona, pero podría ser más prolijo con chips/botones clickeables en el frontend | Backlog: protocolo `suggested_folders` en la respuesta + UI de chips |
| Matching nivel carpeta, no archivo | "asientos cuero" sin proyecto devuelve 0 | Opción A: per-file vision (backlog) |
| Sin embeddings vectoriales | "auto rojo descapotable 60s" no funciona como búsqueda semántica | Opción B: text-embedding-3-small + Atlas Vector Search (backlog) |
| 2 carpetas "Singer" en Drive | "fotos singer" puede caer en la vacía vs la con fotos | Ejecutar [[Bot_Ordenador]] sobre `FOTOS FALTA ORDENAR (carpetas viejas)` |
| Drive del taller original no se toca | Cualquier mejora hay que migrarla a una nueva config | Decisión deliberada — sandbox seguro |

---

## 📚 Referencias

- [[Drive_Assistant]] — dashboard del proyecto (URL, repo, decisiones).
- [[Vision_Analyzer]] — detalle del tagger de imágenes.
- [[Bot_Ordenador]] — el reorganizador automático de Drive.
- [[Metricas_Latencia]] — observabilidad y queries jq.
- [[Como_Acceder]] — guía de uso para el equipo.
- [[Como_Usar_Ordenador]] — quickstart del Bot Ordenador.
- [[Spec_Auto_Sync_Drive]] — única spec pendiente de implementar.
- Repo: `https://github.com/5antuca/ai.gerstner`
- Código en VPS: `/root/apps/ai-gerstner/`
