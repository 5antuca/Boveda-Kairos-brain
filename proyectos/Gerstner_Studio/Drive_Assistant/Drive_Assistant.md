---
tags: [gerstner-werks, drive-assistant, langgraph, fastapi, openai, mvp, en-diseño]
fecha-creacion: 2026-05-09
estado: LISTO PARA BOOTSTRAP — todas las decisiones cerradas, repo creado
dominio: ai.kairosaisolutions.com (A record creado 2026-05-09 → 46.62.235.162)
---

# 🏎️ Gerstner Werks — Drive Assistant

Chatbot interno para el equipo del taller que permite buscar y visualizar imágenes
y videos de proyectos almacenados en Google Drive (~20 GB) usando lenguaje natural.
Entiende la intención, localiza la carpeta correcta vía LangGraph, trae los archivos
desde Drive y los muestra inline en un chat web.

## 🎯 Propuesta de valor

Hoy buscar una foto del Singer interior implica navegar manualmente N niveles de
Drive en el celular. Con el bot: "interior del singer" → 6-12 thumbnails listos
en ~600ms (cache) o ~2.5s (cold).

---

## 📁 Recursos

| Pieza | Donde / URL |
|---|---|
| URL | **https://ai.kairosaisolutions.com** |
| Cómo acceder (incl. mobile) | [[Como_Acceder]] |
| Spec original | [[Spec_Original]] (recibido 2026-05-09) |
| Spec mejoras | [[Spec_Vision_Analyzer]] · [[Spec_Auto_Sync_Drive]] · [[Spec_Fix_Matching_y_Cache]] |
| Implementaciones | [[Vision_Analyzer]] (deployado 2026-05-10, fases 1-3) · [[Metricas_Latencia]] (logs estructurados) |
| Decisiones | [[Decisiones_Pendientes]] (todas resueltas al 2026-05-09) |
| Repo | https://github.com/5antuca/ai.gerstner.git (privado) |
| Dominio | `ai.kairosaisolutions.com` (A record → 46.62.235.162, TTL 3600) |
| VPS | `46.62.235.162` (este mismo, reusa Traefik existente) |
| Clone local | `/root/apps/ai-gerstner/` ✅ |
| **Drive root folder ID (sandbox)** | `1Kp4wPnKhZ-p3yj1dAdIbCJNw6i0KW5Qx` (copia bajo control del usuario, switch hecho 2026-05-10) |
| Drive root folder ID (original taller) | `1aUspFknqw8fdxsowT8HMnUI6f1IGsLGy` (referencia, no usado por el bot) |
| OAuth client_secret | `/root/apps/ai-gerstner/credentials/client_secret.json` ✅ |

---

## 🔄 Switch a sandbox (2026-05-10)

A partir del 2026-05-10 el bot **no apunta más al Drive del taller original**.
Apunta a una copia (`1Kp4wPnKhZ-p3yj1dAdIbCJNw6i0KW5Qx`) que vive en el Drive
personal del usuario y que él controla. Razones:

1. **Experimentación segura**: poder probar futuras features de escritura
   (renombrar, mover, ordenar fotos) sin riesgo de tocar el Drive de producción
   de Andreas.
2. **Estructura más limpia**: la copia tiene 140 carpetas (vs 386 originales)
   con proyectos al root (Shelby Cobra 289, Cobra 427, Singer, etc) en vez
   de sepultados en `00 Fotos Trabajos Gerstner/FOTOS FALTA ORDENAR/`.
3. **Bot ordenador (futuro)**: cuando se diseñe el agente que renombra/mueve
   automáticamente, opera sobre esta copia, no sobre el original.

⚠️ **Implicancia**: cualquiera que use `https://ai.kairosaisolutions.com`
ahora ve contenido del sandbox, no del taller original. Si Andreas quiere
ver el Drive de prod, hay que volver a apuntar el `.env` al ID original.

Comandos del switch documentados en [[Vision_Analyzer]] (sección "Reindex
selectivo") y resumidos acá:

```bash
# 1. Cambiar .env
sed -i 's|DRIVE_ROOT_FOLDER_ID=.*|DRIVE_ROOT_FOLDER_ID=<NUEVO_ID>|' .env
cd /root/apps/ai-gerstner && docker compose up -d backend --force-recreate

# 2. Limpiar todo lo del root viejo
docker exec ai-gerstner-mongo mongosh gerstner_drive --eval 'db.folder_tree.deleteMany({})'
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" .../api/admin/cache
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" .../api/admin/vision
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" .../api/admin/sessions

# 3. Reindex contra la copia
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" .../api/admin/index-drive

# 4. Tag-all en background
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  ".../api/admin/vision/tag-all?n_samples=5"
```

---

## ✅ Decisiones tomadas (2026-05-09)

| # | Decisión |
|---|---|
| **D1** | **Auth a Drive: OAuth con cuenta Google del usuario** (no SA). Carpeta del taller fue compartida, no es propia. |
| **D2** | **LLM: OpenAI gpt-4.1-mini**. Consistencia con Trebol bot, costo despreciable (~$0.30/mes a 50 q/día). |
| **D3** | **Matcher de carpetas: LLM ve folder_tree y elige** (no difflib). |
| **D4** | **Auth de la app: tokens por persona** (Mongo `users` + endpoints admin + `Authorization: Bearer` o `?t=` para magic-links iniciales). |
| **D5** | **Mongo: container local mongo:7** (no Atlas, no cluster compartido con FangioCRM). Aislamiento físico. |
| **D6** | **Streaming: JSON completo** (no SSE) en v1. |
| **D7** | **Indexer: manual via `POST /admin/index-drive`** en v1. Cron en v2. |
| **D8** | **Dominio: `ai.kairosaisolutions.com`**. Subdominio del existente, $0 extra. |
| **D9** | **VPS: este mismo (`46.62.235.162`)**, reusa Traefik. |
| **D10** | **Repo: `5antuca/ai.gerstner` privado**. |
| **D11** | **Ubicación vault: `proyectos/Gerstner_Studio/Drive_Assistant/`**. |

---

## 🔧 Cambios respecto al spec original

El spec recibido apunta a un escenario distinto (service account + nginx standalone + Anthropic + difflib). Los ajustes obligados:

### Auth a Google Drive — SA → OAuth
- Eliminar `GOOGLE_SERVICE_ACCOUNT_PATH` y la lógica de `from_service_account_file`.
- Agregar OAuth 2.0 flow con `google-auth-oauthlib`:
  - **Setup interactivo (una vez)**: script `scripts/oauth_setup.py` que abre browser, login, guarda `token.json` con `refresh_token`.
  - **Runtime**: `Credentials.from_authorized_user_file('token.json')` con auto-refresh.
- `token.json` montado como volumen read/write (Drive API auto-rota access tokens).
- Si el refresh token expira (rare, ~6 meses sin uso): correr `oauth_setup.py` de nuevo.

### LLM — Anthropic → OpenAI
- `langchain-anthropic` → `langchain-openai`.
- `ChatAnthropic(model="claude-haiku-4-5-20251001")` → `ChatOpenAI(model="gpt-4.1-mini")` (o `gpt-4o-mini` — definir).
- Mismo formato de prompts (JSON estructurado), comportamiento equivalente para esta tarea.

### Matcher de carpetas — difflib → LLM
- Nodo `match_folders` ahora hace una llamada LLM:
  - Input: query del usuario + folder_tree compactado (path + folder_id, sin metadata extra).
  - Prompt: "Elegí los folder_ids más relevantes (máx 3) para el query. Respondé JSON: `{folder_ids: [...]}`".
  - Output: `matched_folder_ids` directo en el state.
- Para 200 carpetas el folder_tree es pequeño (<5KB), un solo prompt resuelve.
- Tradeoff: +1 llamada LLM por query (latencia +200-400ms en cache MISS). Aceptable.

### Reverse proxy — nginx → Traefik
Cuando deployemos a este VPS:
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.gerstner-drive.rule=Host(`ai.kairosaisolutions.com`)"
  - "traefik.http.routers.gerstner-drive.entrypoints=websecure"
  - "traefik.http.routers.gerstner-drive.tls.certresolver=letsencrypt"
  - "traefik.http.services.gerstner-drive.loadbalancer.server.port=8000"
networks:
  - traefik_public
```
Sin nginx ni certbot manual. Traefik ya está corriendo y maneja LE.

### Thumbnails — público → proxy backend
En vez de "compartir Drive como cualquiera con el enlace puede ver" (rompe privacidad del taller):
- Endpoint nuevo: `GET /api/thumbnail/{file_id}` con auth de sesión.
- Backend usa OAuth para llamar a `drive.files.get_media()` o `?alt=media` con el thumbnail y lo proxea.
- Cache de bytes con `Cache-Control: private, max-age=86400` y un Mongo cache opcional para los más usados.

### Auth de la app — pendiente (D4)
El spec no tiene auth en `/api/chat`. Hay que agregar:
- **Mínimo viable**: token compartido en query string (`?t=xxxxx`). Frontend lo guarda en localStorage y lo manda en cada call al backend. Bot valida en cada `/api/chat`.
- **Mejor**: tokens por persona (cada miembro del equipo tiene su URL única + revocable).
- **Best**: Google Workspace login del equipo del taller.

Definir en [[Decisiones_Pendientes#Auth de la app]].

### Otros menores
- `@app.on_event("startup")` → `lifespan` context manager (FastAPI moderno).
- `asyncio.get_event_loop()` → `asyncio.to_thread()` directo.
- Indexer hace upsert por `folder_id` en vez de `delete_many({})` (no invalida cache durante reindex).
- Lista hardcodeada de proyectos en el `INTENT_SYSTEM_PROMPT` se reemplaza por inyección dinámica del top-level del folder_tree.

---

## 🗺️ Plan de ejecución

### Fase 1 — Setup local (1-2 días)
1. Crear repo `gerstnerwerks-drive-assistant` (privado).
2. Bootstrap del proyecto con la estructura del spec (con los cambios de arriba aplicados).
3. Configurar OAuth: crear OAuth Client en Google Cloud Console (tipo "Desktop app"), correr `scripts/oauth_setup.py`, guardar `token.json`.
4. Indexar el folder_tree del Drive del taller (manual: `POST /admin/index-drive`).
5. Levantar `docker compose up` local con Mongo + backend + frontend.
6. Probar 5-10 queries golden ("interior del singer", "motor del jaguar", "proceso del bronco", etc).

### Fase 2 — Hardening + auth (2-3 días)
1. Implementar el esquema de auth elegido (D4 pendiente).
2. Proxy de thumbnails + cache Mongo de bytes.
3. Logs estructurados + Langfuse traces (si querés observabilidad estilo Trebol bot).
4. Tests unitarios de los nodos críticos (`parse_intent`, `match_folders`, `generate_response`).

### Fase 3 — Deploy (1 día)
1. Decidir VPS (este mismo recomendado; ver Decisiones_Pendientes).
2. Comprar dominio `gerstnerwerks.ai`.
3. Crear A record → IP del VPS.
4. Levantar containers con labels Traefik.
5. Smoke test contra producción.
6. Compartir URL + token con el equipo del taller.

### Fase 4 — Refinamiento (continuo)
- Tunear prompts según feedback real.
- Agregar streaming SSE si la latencia molesta.
- Endpoint `/admin/refresh-folder/{id}` para forzar invalidate de cache cuando suben fotos nuevas.

---

## 🚧 Bloqueantes para arrancar Fase 1

1. **Confirmar decisiones pendientes** en [[Decisiones_Pendientes]].
2. **Acceso al Drive**: verificar que tu cuenta Google tiene acceso de lectura a la carpeta raíz del taller. Pedir el folder_id (en la URL de Drive cuando abrís la carpeta).
3. **OAuth Client** en Google Cloud Console (gratis, 5 min). Lo armo cuando arranquemos.
4. **Repo nuevo en GitHub**: nombre y org.

---

## 📚 Referencias

- [[Spec_Original]] — spec recibido del usuario el 2026-05-09 (verbatim, antes de modificaciones).
- [[Decisiones_Pendientes]] — D-list para resolver antes/durante implementación.
- [[../Gerstner_Studio|Gerstner Studio (proyecto paraguas)]].
- [[../../Gerstner_Werks/README|Gerstner Werks (taller / cliente final)]].
- [Drive API v3 — OAuth desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app).
- [LangGraph docs](https://langchain-ai.github.io/langgraph/).
- Memory: `reference_secrets_inventario.md` — workflow para rotar API keys sin pegarlas en chat.
