---
tags: [memoria, volcado, n8n, gotchas, deploy]
fecha_volcado: 2026-04-13
n8n_version: 2.2.4
---

# n8n — Gotchas, trampas y deploy playbook

Cosas que ya nos costaron horas de debug. Todo observado en **n8n 2.2.4** en el VPS Kairos.

## ⚠️ typeVersion 2 en Code nodes crashea el Worker

**Síntoma**: ejecución queda "running" para siempre. El Task Runner crashea silenciosamente el worker. Logs: `Failed to start Python task runner in internal mode` (red herring, no es Python, es el JS runner interno).

**Causa**: n8n 2.2.4 no soporta bien `typeVersion: 2` en `n8n-nodes-base.code`. Cualquier Code node importado con esa versión rompe el worker.

**Fix obligatorio al trabajar con trebol_v4_test.json**:
```bash
python3 -c "
import json
wf = json.load(open('workflows/trebol_v4_test.json'))
for n in wf['nodes']:
    if n.get('type') == 'n8n-nodes-base.code' and n.get('typeVersion') == 2:
        n['typeVersion'] = 1
json.dump(wf, open('workflows/trebol_v4_test.json', 'w'), indent=2, ensure_ascii=False)
"
```

**Regla**: **SIEMPRE chequear `code_v2 == []` antes de deployar** un workflow que tenga Code nodes. Es el primer paso de cualquier sesión de patch.

**Excepciones**: el workflow `alertasvendedores_test.json` sí usa Code `typeVersion: 2` sin romper — aparentemente el worker solo se rompe cuando el workflow es grande (trebol v4 tiene 149 nodos). No hay explicación clara, pero empíricamente funciona.

## ⚠️ Switch node `typeValidation` tiene que ser `strict`

Si usás `typeValidation: "loose"` en un Switch node, matchea cosas que no tendría que matchear (ej. `"off"` matchea con truthy check). **Siempre `strict`**.

Ver [[Preferencias_Arquitectura#Memorias duras]] → `feedback_switch_node_strict` en memory store.

## ⚠️ Google Sheets node — 3 modos de referencia

| Modo | Cuándo usar | Rompe si... |
|---|---|---|
| `mode: "list"` con `gid=X` | Valores ESTÁTICOS (dropdown en el editor) | — |
| `mode: "id"` con número puro | EXPRESIONES dinámicas (`={{ $json.gid }}`) | — |
| `mode: "name"` | **EVITAR** | Se rompe cuando renombran el sheet |

**gids estables** (no cambian al renombrar tabs):
- CRM: `gid=0`
- Pedidos: `gid=2004343376`
- Inventario PROD: docId=`1QBxyYP5eOhdjWnkmUzYv-H1RdPxo0L68G8aJD8qA_Fw`, tabs: Vehiculos=0, Nautico=253929510, Motos=509017185, Camiones=1980478262, Maquinaria=409148329

## Deploy workflow — script y flujo

Script: `scripts/deploy-workflow-test.sh`

```bash
bash scripts/deploy-workflow-test.sh trebol_v4_test.json chkkStDHenGFhwE7
bash scripts/deploy-workflow-test.sh alertasvendedores_test.json GyW7SjZluIdZyAYt_9LIO
```

Qué hace internamente:
1. `docker cp` del JSON al container `trebol-test-n8n:/tmp/_deploy_wf.json`
2. `PUT /api/v1/workflows/{id}` via n8n API (solo `name`, `nodes`, `connections`, `settings`, `staticData`)
3. Si `active: false` → POST `/activate` automático
4. Actualiza `updatedAt` → se ve recién editado en la UI

**Post-deploy obligatorio**:
```bash
docker restart trebol-test-n8n trebol-test-n8n-worker
bash scripts/clear-chat-memory.sh 5491150635028 test
```

**Por qué reiniciar ambos**: el Worker tiene caché en memoria de los workflows activos. Sin restart del worker, sigue ejecutando la versión vieja aunque la API ya tenga la nueva.

**Por qué clear-chat-memory**: el bot tiene memoria en Postgres (`n8n_chat_histories`) y Redis (flags `v3:*`). Si no limpiás, el próximo test arranca con estado residual del test anterior y confunde el diagnóstico.

## n8n API key (test)

Está en el script `deploy-workflow-test.sh` hardcoded. Issue pendiente: sacarla de ahí y ponerla en `.env`. Por ahora funciona y no hay apuro.

## n8n CLI — deprecated

`update:workflow` está deprecated → usar `publish:workflow` desde la UI (o el PUT via API que hace el script).

## Workflow IDs relevantes

| Workflow | ID | Env |
|---|---|---|
| Trebol v3 Test | `wynjYf9n43hLdZaB` (75 nodos) | test |
| Trebol v4 Test | `chkkStDHenGFhwE7` (149 nodos) | test |
| Trebol v4 Prod | `wf4ts1WKcpOaE90A__FkD` (149 nodos) | prod (NO tocar sin pedido) |
| SheetsToMongo v2 PROD | `4atsII1pbYHYtOFVYzaVa` | prod |
| AlertasVendedores Test | `GyW7SjZluIdZyAYt_9LIO` | test |
| MV Autos Test | `YdLoz4fjuGlMS1gn-2rU_` | test |

## Backups antes de patch

Patrón: `{wf}.bak.{etapa}` antes de cada fase. Ejemplos reales:
- `trebol_v4_test.json.bak.pre-fase1`
- `trebol_v4_test.json.bak.pre-fase2`
- `trebol_v4_test.json.bak.pre-f3`
- `trebol_v4_test.json.bak.pre-bot-off-fix`
- `trebol_v4_test.json.bak.pre-context-compression`
- `trebol_v4_test.json.bak.guardia-refactor`

Snapshots del estado del VPS:
- `trebol_v4_test_vps_snapshot_2026-04-09.json`
- `trebol_v4_prod_vps_snapshot_2026-04-09.json`

## AlertasVendedores — detalles

- Dispatcher puro: recibe POST → formatea → envía a grupo via Evolution API
- Horarios **test**: Lun-Vie 8:40-18:00, Sáb 8:40-13:00, Dom nada
- Fuera de horario → Wait hasta 8:40 del siguiente día hábil
- **Para adelantar un waitTill manualmente**:
  ```sql
  UPDATE execution_entity SET "waitTill" = 'YYYY-MM-DD HH:MM:00-03'
  WHERE status = 'waiting' AND "workflowId" = 'GyW7SjZluIdZyAYt_9LIO';
  ```
  Luego **restart ambos**: `docker restart trebol-test-n8n trebol-test-n8n-worker`
- **Bug conocido**: alerta `lead_caliente` se duplica — el workflow principal tiene 2 rutas paralelas al mismo nodo (handoff + temperatura). No bloqueante por ahora.

## ⚠️ HTTP Request node — método GET por defecto (2026-04-15)

**Síntoma**: `400 Bad request — Invalid request to GET /v1/chat/completions. You provided a body with this GET request.`

**Causa**: cuando creás un nodo `n8n-nodes-base.httpRequest` vía API (PUT workflow JSON), el campo `method` no tiene default explícito. n8n lo interpreta como GET aunque tengas `sendBody: true` y `specifyBody: "json"`. El body se ignora, se hace GET, la API destino rechaza con 400.

**Fix**: siempre incluir `"method": "POST"` (o el método correcto) explícitamente en `parameters` al construir nodos HTTP vía JSON/script.

```json
"parameters": {
  "method": "POST",
  "url": "https://api.openai.com/v1/chat/completions",
  "sendBody": true,
  ...
}
```

**Dónde nos pasó**: nodo `Extractor LLM Nano` en FangioBot v2 (Sprint 6, 2026-04-15). Mismo bug en `Enviar Mensaje Evolution` y `POST Lead a FangioCRM` del mismo workflow — `404 Cannot GET /message/sendText/el-trebol` desde Evolution API. Afecta a TODOS los nodos HTTP construidos via script/JSON si no se pone `method` explícito.

---

## ⚠️ AI Agent (toolsAgent) — "Could not get parameter: text" (2026-04-15)

**Síntoma**: `Error: Could not get parameter — parameterName: text` al ejecutar el AI Agent.

**Causa**: el modo `toolsAgent` busca un campo `text` en el input para saber cuál es el mensaje del usuario. Cuando el nodo anterior es un Code node (no un Chat Trigger), no hay campo `text` en el JSON — el agent no sabe qué mensaje procesar.

**Fix**: agregar en los parámetros del AI Agent node:
```json
"promptType": "define",
"text": "={{ $('Normalizar Payload').item.json.textoCompleto }}"
```
Esto le dice explícitamente al agent qué campo usar como mensaje entrante. En la UI: AI Agent → pestaña Parameters → "Prompt" → seleccionar "Define below" → pegar la expresión.

**Dónde nos pasó**: FangioBot v2 Sprint 6, AI Agent recibe datos de `Construir Prompt Block` (Code node). 2026-04-15.

---

## ⚠️ `$env` bloqueado por defecto en n8n 2.x (2026-04-15)

**Síntoma**: `ExpressionError: access to env vars denied` al usar `$env.VARIABLE` en cualquier nodo.

**Causa**: n8n 2.x bloquea el acceso a env vars desde expresiones de nodos por defecto (aunque no estén seteadas explícitamente). El mensaje sugiere sacar `N8N_BLOCK_ENV_ACCESS_IN_NODE`, pero en realidad hay que setearlo en `false`.

**Fix**: agregar en el `environment` de **AMBOS** containers (master y worker) en `docker-compose.yml`:
```yaml
- N8N_BLOCK_ENV_ACCESS_IN_NODE=false
```
Luego `docker compose up -d n8n n8n-worker`.

**Nota**: el worker también necesita las env vars que los nodos van a usar (`EVOLUTION_URL`, `EVOLUTION_API_KEY`) porque es el worker quien ejecuta los nodos, no el master.

**Nota 2**: n8n Variables (`$vars`) requieren licencia — no disponible en community. Usar `$env` con el flag en false es la solución correcta para self-hosted community.

---

## ⚠️ AI Agent — `toolsAgent` no existe en n8n 2.2.4 (2026-04-15)

**Síntoma**: `The value "toolsAgent" is not supported!` al abrir o ejecutar el AI Agent node.

**Causa**: `toolsAgent` es un tipo de agente agregado en versiones posteriores de n8n. En 2.2.4 no existe.

**Fix**: usar `openAiFunctionsAgent` en su lugar. Es el equivalente funcional para modelos OpenAI — usa function calling nativo, maneja tools estructuradas con la misma confiabilidad.

En el JSON: `"agent": "openAiFunctionsAgent"`. En la UI: AI Agent → Agent → seleccionar "OpenAI Functions Agent".

---

## ⚠️ `.item` vs `.first()` — Code nodes rompen el pairedItem tracking (2026-04-16)

**Síntoma**: `NodeOperationError: Paired item data for item from node 'Init Loop' is unavailable. Ensure 'Init Loop' is providing the required output.` en cualquier nodo Redis (u otro) que esté **después** de un Code node en el pipeline.

**Causa**: Los Code nodes (`n8n-nodes-base.code`) NO emiten `pairedItem` data en sus outputs a menos que el código lo setee explícitamente. Cuando un nodo downstream usa `$('NodoAnterior').item` y hay un Code node en el medio de la cadena, n8n no puede trazar a qué item input corresponde el item actual, y tira el error.

El accessor `.item` requiere cadena de pairedItem intacta desde el nodo referenciado hasta el nodo actual. Un solo Code node sin pairedItem rompe esa cadena para todos los nodos que siguen.

**Fix**: reemplazar `.item` por `.first()` en cualquier nodo que esté aguas abajo de un Code node:

```
// ❌ Falla si hay un Code node entre Edit Fields y este nodo
$('Edit Fields').item.json.chat_id

// ✓ Correcto — no requiere pairedItem tracking
$('Edit Fields').first().json.chat_id
```

`.first()` es semánticamente equivalente cuando el nodo referenciado siempre produce exactamente 1 item (como Edit Fields en el pipeline Trebol, que recibe 1 webhook = 1 conversación).

**Dónde nos pasó**: Todos los nodos Redis después de `Init Loop` (Code node) en `trebol_v4_test.json` y `wf4ts1WKcpOaE90A__FkD`. Afectó a: `Redis1`, `Redis GET Loop`, `Redis LLEN Check`, `Redis DEL processing`, `Redis LLEN Check Auto`, `Redis DEL processing Auto` — 35 referencias en prod, 17 en test.

**Cuándo falló**: Las ejecuciones que llegaban antes del loop (filtraban por bot_status=off, etc.) nunca llegaban a los nodos afectados → parecía que andaba. Los primeros mensajes reales que atravesaron el pipeline completo (después de una reconexión de WhatsApp) expusieron el bug.

**Regla**: en cualquier nodo que siga a un Code node, **siempre usar `.first()` o `.all()[0]`** en lugar de `.item` para referencias a nodos anteriores al Code node.

---

## Links

- [[Pipeline_v4]]
- [[VPS_Stack]]
- [[Redis_Postgres_Debug]]
