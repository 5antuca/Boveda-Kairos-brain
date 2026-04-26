---
tags: [proyecto, langgraph, python, migración, bot, whatsapp]
fecha_inicio: 2026-04-16
estado: en_curso
---

# LangGraph Bot — Proyecto de Migración

Migración del bot de WhatsApp de El Trébol (actualmente en n8n) a un servicio Python con LangGraph. El servicio está diseñado para ser multi-tenant desde el día 1: la misma codebase sirve a Trébol (config propia) y a futuro a Fangio CRM y otros clientes.

## Por qué LangGraph

- **Observabilidad**: Langfuse (self-hosted / cloud free tier) traza cada turno completo — qué recibió el LLM, qué tools llamó, qué devolvió. Hoy requiere parsear flatted JSON de Postgres.
- **Debugging con IA**: Claude y Cursor leen Python directamente. El JSON de 149 nodos de n8n no.
- **System prompt externo**: cambiar el prompt = editar un `.txt`. Sin workflow redeploy, sin downtime de WhatsApp.
- **Guardias como nodos**: el state machine de permuta/anticipo mapea 1:1 con nodos LangGraph.
- **Multi-tenant por diseño**: config YAML por cliente, `client_id` en todas las keys Redis y traces.

## Arquitectura

```
WhatsApp → Evolution API → Chatwoot → POST /webhook/chatwoot
                                              ↓
                              [trebol-bot] FastAPI + LangGraph   ← Python 3.12, Docker
                                              ├── LangGraph Agent
                                              │     ├── Tool: buscar_inventario (MongoDB Atlas)
                                              │     ├── Tool: calcular_cuotas (Python)
                                              │     └── Tool: opciones_financiacion (Sheets)
                                              ├── Redis (debounce + RedisChatMessageHistory)
                                              ├── Langfuse (observabilidad, cloud free tier)
                                              └── POST → n8n (CRM write + alertas)
                                              ↓
                              Chatwoot → Evolution → WhatsApp

n8n sigue manejando:
  SheetsToMongo | AlertasVendedores | CRM Sheets write | Error Handler
```

## Repo

```
bot-service/
  trebol_bot/
    main.py                ← FastAPI entry point
    config.py              ← Settings (pydantic-settings, env vars)
    webhook/
      chatwoot.py          ← Payload models + event handler
    agent/
      graph.py             ← LangGraph graph (Fase 1+)
      tools.py             ← buscar_inventario, calcular_cuotas, opciones_financiacion
      prompts.py           ← System prompt loader desde configs/
      classifier.py        ← Clasificador determinístico (regex, Fase 2)
    memory/
      redis_client.py      ← Conexión Redis + debounce
      chat_history.py      ← RedisChatMessageHistory wrapper (Fase 2)
    integrations/
      chatwoot_client.py   ← Enviar mensajes a Chatwoot
      mongodb_client.py    ← MongoDB Atlas connection (Fase 1)
      sheets_client.py     ← Google Sheets read/write (Fase 1)
  configs/
    trebol.yaml            ← Config Trébol (persona, prompt path, mongo collection, sheets IDs)
  Dockerfile
  requirements.txt
  .env.example
```

## Roadmap

| Fase | Descripción | Estado |
|---|---|---|
| **0 — Esqueleto** | FastAPI + Docker + Langfuse + webhook receiver | ✅ 2026-04-16 — `trebol-test-bot` Up (healthy) |
| **1 — Agent core** | LangGraph graph + 3 tools (MongoDB, Sheets, cuotas) | ✅ 2026-04-16 — agent responde con inventario real, Langfuse traza |
| **2 — Estado y debounce** | Redis debounce + historial de conversación | ✅ 2026-04-16 — asyncio task cancellation, RedisChatMessageHistory propio, 0 race conditions |
| **3 — CRM e integración n8n** | Google Sheets write directo (Python) + AlertasVendedores webhook | ✅ 2026-04-16 — extracción LLM structured output, CRM append/update, alertas fire-and-forget |
| **4 — Multi-tenant config** | YAML por cliente, ContextVar en tools, config limpia | ✅ 2026-04-17 — agregar cliente = solo YAML + prompt, sin cambios de código |
| **5 — Validación en test** | Regresiones con conversaciones malas documentadas | ✅ 2026-04-17 — 23/23 checks pasan. Harness: `scripts/test_bot.sh`. 7 scenarios: hilux, tiago, budget_filter, financiacion, cuotas, multi_turn, no_stock |
| **6 — Cutover test** | Webhook Chatwoot test → bot, observabilidad Langfuse completa | ✅ 2026-04-17 — Webhook ID 1 apunta a bot. Inbox filter (inbox_id=2). Traces Langfuse anidan: agent_run + tool_calls + response_sent + crm_extraction |
| **7 — CRM state + fotos + saludo** | Persistir estado CRM en Redis + envío de imágenes + saludo inicial determinístico | ✅ 2026-04-17 — ver [[#Fase 7 — CRM state, Fotos y Saludo]] |
| **8 — Observabilidad profunda** | session_id canónico, metadata/tags, captura de errores, normalize_phone | ✅ 2026-04-17 — ver [[Observabilidad_Langfuse]] |
| **9 — Sheets fix (cols M → A)** | `values().update()` con rango explícito en vez de `append()` | ✅ 2026-04-17 — fix en `sheets_client.py` |
| **10 — Cutover prod** | Cambiar webhook Chatwoot prod → bot + DNS + Traefik + extra_hosts | ✅ 2026-04-18 — ver [[Prod_Deploy]] |
| **11 — Supreme Sales Swarm F1 + LLM migration + Token optimization** | Profiler psicográfico, migración cognitivo a Groq, prompt comprimido 8K→3.5K, CRM extractor guard | ✅ 2026-04-26 (test) — ver [[Sesion_2026-04-25_Sales_Swarm_y_LLM_Migration]] |

## Decisiones técnicas

| Decisión | Elección | Alternativa descartada |
|---|---|---|
| Framework | LangGraph (sobre LangChain) | LangChain sin graph — no tiene state management |
| Lenguaje | Python 3.12 | Node.js — ecosistema LangChain es mejor en Python |
| Observabilidad | Langfuse Cloud free tier | LangSmith (pago) / Langfuse self-hosted (más infra) |
| Memoria | RedisChatMessageHistory (Redis existente) | Postgres — Redis ya está en el stack |
| Clasificador | Python regex (determinístico) | LLM — la lógica de routing no debe ser probabilística |
| Guardias | Nodos LangGraph con state | Code nodes n8n — difíciles de extender |
| CRM write | POST a n8n webhook | Python directo a Sheets — n8n ya tiene la lógica |
| LLM cognitivo (2026-04-26) | Groq Llama 3.3 70B | Gemini 2.5 Flash (free tier 250 RPD muy bajo) · OpenAI (key del cliente) |
| Provider Profiler (2026-04-26) | Groq Llama 3.1 8B Instant | Mismo 70B (cuota separada conviene para classification) |

## Observabilidad — Langfuse (Fase 6)

Cada mensaje de WhatsApp genera un **trace** padre en Langfuse con esta estructura:

```
TRACE: whatsapp_turn
  session_id: trebol:{chat_id}
  user_id: {phone}
  input: {message, history_turns}
  │
  ├── SPAN: agent_run  ← auto-instrumentado por CallbackHandler (anidado en el trace padre)
  │     ├── agent_node → LLM call #1 (system prompt + historial + mensaje)
  │     ├── tool_node  → buscar_inventario_autos({query, budget}) → [autos]
  │     └── agent_node → LLM call #2 (con resultados de tool)
  │
  ├── SPAN: response_sent
  │     output: preview de la respuesta enviada a Chatwoot
  │
  └── SPAN: crm_extraction  ← async, aparece ~1s después
        output: {nombre, vehiculo_interes, estado, tipo_alerta, ...}
```

- **URL**: https://us.cloud.langfuse.com
- **Buscar por sesión**: Sessions → `session_id = trebol:{chat_id}` (el chat_id es el ID de conversación de Chatwoot, visible en la URL de Chatwoot)
- **Buscar por usuario**: `user_id = {phone}@s.whatsapp.net` (ej: `5491150635028@s.whatsapp.net`)
- **Tags**: `["trebol"]` para conversaciones reales, `["trebol", "test"]` para el harness `/test/message`
- **Tokens**: en cada `GENERATION ChatOpenAI` dentro del trace — `in=X out=Y total=Z`
- **Fuente**: `observability.py` (singleton client), `chatwoot.py` (trace padre), `graph.py` (LangGraph handler), `crm.py` (span CRM)

## Ciclo de debug

```
1. Respuesta mala en WhatsApp
   ↓
2. Langfuse → Sessions → trebol:{chat_id}
   Ver: qué recibió el LLM (system prompt + historial + mensaje)
        qué tool llamó y con qué args
        qué devolvió la tool
        qué respondió el LLM final
   ↓
3. Identificar causa:
   ├── Prompt mal → editar configs/prompts/trebol.txt → docker restart trebol-test-bot (NO rebuild)
   ├── Tool mal   → editar agent/tools.py → docker compose build + up
   └── Flujo mal  → editar agent/graph.py → docker compose build + up
   ↓
4. bash scripts/test_bot.sh [scenario] para verificar regresión
```

**Hairpin NAT**: todos los containers del stack deben tener `extra_hosts` para que los dominios
`*.kairosaisolutions.com` resuelvan a `172.18.0.100` (Traefik) en vez de la IP pública del VPS.
Sin esto, los containers no pueden comunicarse entre sí por dominio.

## Notas técnicas Fase 1

- **MongoDB pre-filter no soportado**: el `vector_index` de Atlas no tiene `PRECIO_AL_CONTADO` indexado como filtro. El filtro de presupuesto se hace en Python post-search (recupera k=16, filtra, recorta a 8).
- **PRECIO_AL_CONTADO es string**: el campo viene como `"USD  9.000"` — helper `_parse_precio()` en tools.py normaliza a float.
- **Langfuse callback**: se pasa via `config["callbacks"]` a `graph.ainvoke()`. Cada run aparece en us.cloud.langfuse.com con `session_id=trebol:{chat_id}`, `user_id={phone}`.
- **Historial de conversación**: `memory/chat_history.py` — `RedisMessageHistory` propio (no depende de langchain-community). Keys: `bot:{client_id}:{phone}:history`, JSON, TTL 7 días, max 20 mensajes (10 turnos).
- **Chatwoot client**: `send_message()` usa `api_access_token` header + POST a `/api/v1/accounts/{id}/conversations/{conv_id}/messages`.
- **System prompt path**: `bot-service/configs/prompts/trebol.txt` — copia de `prompts/trebol_v4_system_prompt.txt`. Editable sin rebuild.

## Convenciones Redis (bot)

Namespace separado del n8n para no colisionar:

```
bot:{client_id}:{phone}:buffer        ← debounce (LPUSH/LRANGE)
bot:{client_id}:{phone}:processing    ← lock procesamiento (SET EX 120)
bot:{client_id}:{phone}:history       ← RedisChatMessageHistory key
bot:{client_id}:{phone}:ficha         ← JSON {vehiculo, contado, anticipo_min}
```

## Dominios (test)

- Bot service: `test-trebol.bot.kairosaisolutions.com`
- n8n (sin cambios): `test-trebol.n8n.kairosaisolutions.com`

## Chatwoot Webhooks (test)

| ID | URL actual | Subscripción | Estado |
|---|---|---|---|
| 1 | `https://test-trebol.bot.kairosaisolutions.com/webhook/chatwoot` | `message_created` | ✅ apunta al bot LangGraph |
| 2 | `https://test-trebol.n8n.kairosaisolutions.com/webhook/feedback-conversacion` | `conversation_updated` | mantiene n8n (CRM feedback) |

Filtro de inbox: el bot solo procesa `inbox_id=2` ("TrebolWhatsApp"). Los mensajes de otros inboxes (ej. MV Autos) son ignorados silenciosamente.

## Links

- [[Operar_Bot]] — runbook (apagar/prender, bot-off, alertas)
- [[OpenAI_Quota_Fallback]] — alerta + recovery ante 429 de OpenAI (2026-04-19)
- [[Observabilidad_Langfuse]] — debugging con traces
- [[Prod_Deploy]] — detalles del cutover prod (2026-04-18)
- [[Onboarding_Nuevo_Cliente]] — guía paso a paso para agregar Fangio CRM (u otro cliente)
- [[Supreme_Sales_Swarm]] — F1 (Profiler) deployed test, F2-F6 pendientes
- [[LLM_Providers]] — strategy Gemini/Groq/OpenAI
- [[Token_Optimization]] — métricas y técnicas de compresión
- [[Sesion_2026-04-25_Sales_Swarm_y_LLM_Migration]] — sesión 2026-04-25/26
- [[../Trebol|Trebol]] — cliente principal
- [[../Fangio_CRM|Fangio_CRM]] — segundo cliente futuro
- [[../Trebol/Pipeline_v4|Pipeline_v4]] — arquitectura n8n previa (referencia histórica)
- [[../../infra/n8n_Gotchas|n8n_Gotchas]] — gotchas del stack
- Repo reference: `langgraph-sales-agent` (yerdaulet-damir) — patrón de referencia para multi-tenant
