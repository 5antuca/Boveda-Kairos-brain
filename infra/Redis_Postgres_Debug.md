---
tags: [memoria, volcado, redis, postgres, debug, playbook]
fecha_volcado: 2026-04-13
---

# Redis + Postgres — Debug playbook Trebol

Recetas concretas que usé en sesiones reales. No teoría.

## Redis — Schema de keys del bot v3/v4

Todas las keys del bot viven bajo el prefijo `v3:` (histórico — no renombramos al pasar a v4 para no romper).

| Key | Tipo | TTL | Propósito |
|---|---|---|---|
| `v3:{chat_id}:buffer` | List | — | Debounce buffer (3s window) |
| `v3:{chat_id}:processing` | String | 120s | Lock "estoy procesando este chat" |
| `v3:{chat_id}:ficha_enviada` | String (JSON) | ~horas | Ficha vehículo cacheada para no re-consultar RAG |
| `v3:{chat_id}:bot_off` | String | 72h (259200s) | **[post bot-off fix]** Flag handoff duro, valor = motivo (handoff/foto/papeles) |

**Formato de chat_id**: `{phone}@s.whatsapp.net` (ej. `5491150635028@s.whatsapp.net`)

## Clear chat memory (post-deploy obligatorio)

```bash
bash scripts/clear-chat-memory.sh 5491150635028 test
```

Qué hace:
- Borra `n8n_chat_histories` de Postgres test para ese session_id
- Borra **todas** las keys Redis `v3:{chat_id}:*` en test
- **Solo test** — el modo prod fue removido por seguridad

Output esperado:
```
Postgres: N mensajes borrados
Redis v4: X keys borradas
Redis v3: Y keys borradas
```

## Redis CLI directo (test)

```bash
docker exec trebol-test-redis redis-cli \
  -a 551ea4589d1f62e86de01e9d2d44f9af1f7c9bd252bcf945138082e79d8267dc \
  KEYS 'v3:5491150635028*'

docker exec trebol-test-redis redis-cli \
  -a ... \
  GET 'v3:5491150635028@s.whatsapp.net:bot_off'
```

## Postgres — Parse de execution_data con `flatted`

n8n guarda el JSON de `execution_data.data` serializado con el módulo `flatted` (custom cyclical JSON). `JSON.parse` no funciona.

### Receta — copiar flatted desde el container n8n

```bash
docker cp trebol-prod-n8n:/usr/local/lib/node_modules/n8n/node_modules/.pnpm/flatted@3.2.7/node_modules/flatted /tmp/flatted_mod
```

**Importante**: usar el build CJS (`/tmp/flatted_mod/cjs/index.js`), **no** `/tmp/flatted_mod/index.js` — este último es ESM y tira `ReferenceError: self is not defined` en scripts Node standalone.

### Query para debugear un turno específico

```sql
SELECT id, "workflowId", "startedAt", status, "waitTill"
FROM execution_entity
WHERE "workflowId" = 'wf4ts1WKcpOaE90A__FkD'
  AND "startedAt" BETWEEN '2026-04-12 21:00:00' AND '2026-04-12 21:15:00'
ORDER BY "startedAt";
```

Luego traer el `data` de `execution_data`:
```sql
SELECT data FROM execution_data WHERE "executionId" = 20365;
```

Y parsearlo con Node + flatted:
```javascript
const flatted = require('/tmp/flatted_mod/cjs/index.js');
const raw = require('fs').readFileSync('/tmp/exec_20365.json', 'utf8');
const parsed = flatted.parse(raw);
// parsed.resultData.runData['Normalizar Payload'][0].data.main[0][0].json.bot_status
console.log(JSON.stringify(parsed.resultData.runData, null, 2).slice(0, 2000));
```

Con esto podés ver, nodo por nodo, qué entró y qué salió de cada paso del pipeline.

Ver también [[reference_n8n_exec_debug]] en memory store.

## Postgres — Tablas clave

### DB `n8n`
- `execution_entity` — metadata de cada ejecución (id, workflowId, startedAt, status, waitTill)
- `execution_data` — payload gigante serializado con flatted
- `workflow_entity` — workflows versionados
- `credentials_entity` — credentials encriptadas

### DB `postgres`
- `n8n_chat_histories` — historial conversacional del bot (session_id, message, type: human/ai)
- `llm_drift_events` (F3) — drift detector: bot mencionando presupuestos en USD sin datos reales
- Otras tablas CRM extraídas

### DB `chatwoot`
- `conversations` — con `custom_attributes` JSONB (donde vive `bot: on|off`)
- `account_users` — relación user↔account↔role. **Tabla frágil** — si apunta a una account borrada, rompe login con 500. Ver [[Chatwoot_Evolution_Quirks#Login 500 bug]].
- `users`, `accounts`, `messages`, `contacts`

## Queries útiles

### ¿Cuántos mensajes tiene un chat en el historial?
```sql
SELECT COUNT(*), type FROM n8n_chat_histories
WHERE session_id = '5491150635028@s.whatsapp.net'
GROUP BY type;
```

### Últimas 20 ejecuciones del bot v4 prod con errores
```sql
SELECT id, "startedAt", status, "waitTill"
FROM execution_entity
WHERE "workflowId" = 'wf4ts1WKcpOaE90A__FkD'
  AND status IN ('error', 'crashed')
ORDER BY "startedAt" DESC LIMIT 20;
```

### Ver custom_attributes actual de un conversation en Chatwoot
```sql
SELECT id, custom_attributes, status
FROM conversations
WHERE id = 323;
```

## Drift detector (F3)

Tabla: `llm_drift_events` en DB `postgres` (test).
Script setup: `scripts/apply_f3_drift_detector.py`
Test harness golden: `bash scripts/test_conversation.sh [tiago|hilux|all]` — regresión automatizada sin credenciales (POST directo al webhook + extracción via flatted).

## Links

- [[Pipeline_v4]]
- [[n8n_Gotchas]]
- [[Chatwoot_Evolution_Quirks]]
- [[2026-04-12 Handoff Blando Jeep Compass]]
