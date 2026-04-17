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
| **5 — Validación en test** | Regresiones con conversaciones malas documentadas | ⬜ pendiente |
| **6 — Cutover** | Cambiar webhook Chatwoot test → bot, luego prod | ⬜ pendiente |

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

## Links

- [[Trebol]] — cliente principal
- [[Fangio_CRM]] — segundo cliente futuro
- [[Pipeline_v4]] — arquitectura n8n actual (referencia para la migración)
- [[n8n_Gotchas]] — gotchas del stack actual que desaparecen con Python
- Repo reference: `langgraph-sales-agent` (yerdaulet-damir) — patrón de referencia para multi-tenant
