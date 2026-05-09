---
tags: [gerstner-werks, drive-assistant, spec, archivado]
fecha: 2026-05-09
estado: ARCHIVADO — referencia histórica. Spec ejecutable refinado en [[Drive_Assistant]] + [[Decisiones_Pendientes]]
---

# Spec Original — Drive Assistant

Spec recibido del usuario el 2026-05-09 en chat. Se preserva acá por referencia.
Las modificaciones ya negociadas (OAuth en vez de SA, OpenAI en vez de Anthropic,
LLM matcher en vez de difflib, Traefik en vez de nginx, auth no-pública) están
documentadas en [[Drive_Assistant]] y no se reflejan acá.

> **Importante**: este doc NO es la fuente de verdad para implementar. Es el punto
> de partida histórico. Para arrancar Fase 1, leer [[Drive_Assistant]] primero.

---

## 1. Visión

Chatbot interno para el equipo de Gerstner Werks que permite buscar y visualizar
imágenes y videos del taller almacenados en Google Drive (~20 GB) usando lenguaje
natural. URL prevista: `https://gerstnerwerks.ai`.

## 2. Stack propuesto (original)

| Pieza | Elección original | Estado tras decisiones |
|---|---|---|
| Orquestación | LangGraph (Python) | ✅ se mantiene |
| LLM | Claude Haiku 4.5 | ❌ cambia a OpenAI gpt-4.1-mini |
| Drive auth | Service Account | ❌ cambia a OAuth user |
| Base de datos | MongoDB | ✅ se mantiene |
| API | FastAPI | ✅ se mantiene |
| Frontend | React (Vite) | ✅ se mantiene |
| Reverse proxy | nginx + certbot | ❌ cambia a Traefik |
| Matcher | `difflib.SequenceMatcher` | ❌ cambia a LLM |
| Auth de la app | (no definido) | ⏳ pendiente — token por persona probable |
| Thumbnails | "Cualquiera con el enlace puede ver" | ❌ cambia a proxy backend |

## 3. Estructura del proyecto (sigue válida en su mayoría)

```
gerstner-drive-assistant/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── agent/
│   │   │   ├── graph.py
│   │   │   ├── state.py
│   │   │   ├── nodes/  (parse_intent, match_folders, check_cache, search_drive, save_cache, generate_response)
│   │   │   └── prompts.py
│   │   ├── services/
│   │   │   ├── drive_service.py
│   │   │   └── indexer_service.py
│   │   └── routers/
│   │       ├── chat.py
│   │       └── admin.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

(Se eliminan `nginx/` y `credentials/` del original — Traefik externo + OAuth en vez de SA.)

## 4. LangGraph — flujo lógico (sigue válido)

```
parse_intent → match_folders → check_cache
                                   ├── HIT → generate_response → END
                                   └── MISS → search_drive → save_cache → generate_response → END
```

## 5. Estado del agente (`AgentState`)

```python
class AgentState(TypedDict):
    query: str
    session_id: str
    intent: Optional[IntentData]
    folder_tree: list[dict]
    matched_folder_ids: list[str]
    files: list[FileInfo]
    cache_hit: bool
    response_text: str
    response_images: list[FileInfo]
    error: Optional[str]
```

## 6. Schemas MongoDB (sigue válido)

- `folder_tree` — árbol de carpetas indexado, índice unique en `folder_id`.
- `folder_cache` — TTL nativo de 24h en `expires_at`, lista de archivos por carpeta.
- `chat_sessions` — historial por `session_id`.

## 7. Endpoints (sigue válido)

- `POST /chat/` — query principal.
- `POST /admin/index-drive` — re-indexar folder tree (con auth admin).
- `DELETE /admin/cache` — limpiar cache.
- (nuevo, post-decisiones) `GET /api/thumbnail/{file_id}` — proxy de thumbnails.

## 8. Latencia esperada (del spec original)

- Cache HIT: ~600ms (solo LLM final).
- Cache MISS: ~2.5s (LLM + Drive API).
- Segunda consulta misma carpeta: ~600ms (siempre HIT mientras no expire).

Con el cambio a OpenAI gpt-4.1-mini estos números deberían ser similares o ligeramente mejores.

## 9. Lo que cambió de fondo

- **Drive auth**: la carpeta no es del usuario, le fue compartida. SA no es viable sin pedirle al dueño que share la SA email. OAuth con cuenta del usuario es la ruta más liviana. Implica un setup interactivo único (script `oauth_setup.py`) y un `token.json` montado.
- **LLM**: usar lo que ya está pago (OpenAI), evitar fragmentar providers.
- **Matcher**: el spec original usa `difflib.SequenceMatcher` que es frágil con nombres compuestos. Con LangGraph y un LLM ya en el pipeline, es más natural delegar el match al modelo.
- **Reverse proxy**: el VPS objetivo ya tiene Traefik en 80/443. Reemplazar nginx + certbot por labels Traefik.
- **Thumbnails**: el spec proponía hacer la carpeta de Drive "cualquiera con el enlace puede ver", lo que rompe la privacidad del taller. Proxy via backend con auth de sesión es más limpio.
- **Auth de la app**: el spec no definía auth — la app tendría sido pública. Se agrega capa de auth (esquema concreto a decidir, ver D-Auth en Decisiones_Pendientes).

---

## Notas de implementación útiles del spec original

(Estas piezas siguen siendo válidas como estaban, citándolas sin cambios)

### Estructura del documento `folder_tree`
```javascript
{
  folder_id: "1Bxyz...",
  name: "Interior",
  path: "Porsche Singer/Interior",
  parent_id: "0Axyz...",
  depth: 1,
  updated_at: ISODate
}
```

### TTL nativo de Mongo para `folder_cache`
```python
await db.folder_cache.create_index(
    "expires_at", expireAfterSeconds=0
)
```

### Frontend — componentes (sigue valido)
- `App.jsx` (root, session_id global)
- `ChatWindow.jsx` (mensajes + input)
- `MessageBubble.jsx` (burbujas user/assistant + ImageGrid)
- `ImageGrid.jsx` (1/2/3+ columnas según N imágenes)
- `useChat.js` (hook con `sendMessage` + estado)
