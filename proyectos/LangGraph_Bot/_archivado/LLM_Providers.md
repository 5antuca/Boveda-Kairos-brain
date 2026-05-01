---
tags: [llm, gemini, groq, openai, providers, costos]
fecha: 2026-04-26
estado: vigente — Groq como provider cognitivo activo
---

# LLM Providers — Estrategia y configuración

A partir del 2026-04-26 el bot Trébol usa **3 providers en paralelo**, cada uno por razones específicas. Esta página es la referencia única.

## Mapeo de componentes a providers

| Componente | Provider | Modelo | Razón |
|---|---|---|---|
| Agent principal (`graph.py`) | **Groq** | `llama-3.3-70b-versatile` | Fast, free 14.4k RPD, fuerte tool calling |
| Profiler (Sales Swarm) | **Groq** | `llama-3.1-8b-instant` | Cuota separada del 70B, 10x más barato, classification simple |
| CRM extractor async | **Groq** | `llama-3.3-70b-versatile` | Misma del agent |
| Vector embeddings (MongoDB) | OpenAI | `text-embedding-3-small` | El index de Atlas se construyó con estos. Cambiar = reindexar todo. |
| Whisper (audio) | OpenAI | `whisper-1` | No hay equivalente en Groq/Gemini |

## Factory de provider — `bot-service/trebol_bot/llm.py`

Punto de entrada único:
```python
from trebol_bot.llm import make_llm

llm = make_llm(client_id="trebol", temperature=0.0, callbacks=[...])
llm = make_llm(client_id="trebol", model_override="llama-3.1-8b-instant")  # para Profiler
llm_struct = make_llm(...).with_structured_output(MySchema)
llm_tools = make_llm(...).bind_tools(TOOLS)
```

Selección de provider vía env: `LLM_PROVIDER` (`groq` default | `gemini` | `openai`).

## Variables de entorno

```bash
# Provider activo
LLM_PROVIDER=groq

# Groq (https://console.groq.com/keys — gratis, sin tarjeta)
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile

# Gemini (https://aistudio.google.com/apikey)
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.5-flash

# OpenAI — del CLIENTE Trébol. Solo embeddings + whisper.
OPENAI_API_KEY=sk-proj-...
```

## Detección de errores 429 / quota

Helper: `bot-service/trebol_bot/llm.py::is_rate_limit_error(exc) -> bool`. Cubre:
- OpenAI `RateLimitError`
- Google `ResourceExhausted`
- Groq `RateLimitError`
- Fallback por keyword en el mensaje ("429", "rate limit", "quota", "resource_exhausted")

## Comportamiento ante 429

En `graph.py` post-error del grafo:
- Si `LLM_PROVIDER=openai` y hay 429 → `handle_openai_quota_error()` (alerta única al grupo + bot_off).
- Si `LLM_PROVIDER` es Groq/Gemini y hay 429 → `llm_quota_exhausted_silent` (warning interno, **sin alerta**, devuelve silencio al cliente).

Razón: la key OpenAI es del cliente Trébol → si se rompe, alguien tiene que actuar. Las cuotas free de Groq/Gemini se resetean solas, no vale la pena despertar al grupo.

## Free tiers comparados (medidos 2026-04-26)

### Groq Llama 3.3 70B versatile
- 30 RPM (requests/min)
- 14.400 RPD (requests/día)
- **100.000 TPD (tokens/día)** ← bottleneck real
- Reset: ventana rolling 24h por modelo

### Groq Llama 3.1 8B instant
- 30 RPM
- 14.400 RPD
- **500.000 TPD** ← cuota separada del 70B (perfecto para Profiler)

### Gemini 2.5 Flash
- 250 RPD
- 10 RPM
- ~100K TPD
- Solo este y `gemini-2.5-flash-lite` y `gemini-flash-latest` están habilitados free para keys de proyectos nuevos. `gemini-2.0-flash` y `2.0-flash-lite` tienen `limit: 0` (free deshabilitado).

## Paid tiers (si free no alcanza)

| Provider | Modelo | $/MTok input | $/MTok output | Para Trébol prod (~600 turn/día × 8K) |
|---|---|---:|---:|---:|
| Groq Dev Tier | Llama 3.3 70B | $0.59 | $0.79 | **~$2/mes** ← elegido si free no alcanza |
| Gemini Paid | 2.5 Flash | $0.075 | $0.30 | ~$0.40/mes |
| OpenAI | GPT-4.1-mini | $0.15 | $0.60 | ~$0.80/mes |

## Rollback de emergencia

Si Groq rompe (downtime, quota exhausted, cambio de pricing):
```bash
# Cambiar provider
sed -i 's/LLM_PROVIDER=.*/LLM_PROVIDER=gemini/' environments/test/trebol/.env
# o LLM_PROVIDER=openai (cae a la key del cliente)

unset GEMINI_API_KEY GROQ_API_KEY  # evitar override del shell
docker compose up -d --no-deps --force-recreate trebol-test-bot
```

Sin cambios de código.

## Por qué este split (decisión arquitectónica)

La key OpenAI fue provista por el cliente Trébol al inicio del proyecto. Migrar el cognitivo (donde está el ~95% del costo) a Groq/Gemini libera al cliente. Quedan:
- Embeddings: $0.02/mes para Trébol — micro.
- Whisper: $0.006/min de audio — micro.

Si en el futuro queremos despegar embeddings/Whisper también, hay que coordinar reindexar MongoDB con embeddings nuevos.

## Gotchas operativos

### Shell environment override
Si tenés `GROQ_API_KEY` o `GEMINI_API_KEY` exportada en el shell, **gana sobre el `.env`** del compose. Siempre `unset` antes de `docker compose up`:
```bash
unset GEMINI_API_KEY GROQ_API_KEY
docker compose up -d --no-deps --force-recreate trebol-test-bot
```

### `langchain-google-genai` FutureWarning
El paquete usa el SDK viejo `google.generativeai` (deprecated) por dentro. No bloqueante. Cuando saquen versión que usa `google.genai` actualizar.

### Cuotas distintas por modelo en Groq
Cada modelo de Groq tiene su cuota **separada**. Por eso el Profiler usa `llama-3.1-8b-instant` mientras el Agent usa `llama-3.3-70b-versatile` — cada uno tiene sus 100K-500K tokens diarios independientes.

## Links

- [[Sesion_2026-04-25_Sales_Swarm_y_LLM_Migration]] — historia de la migración
- [[Token_Optimization]] — costos efectivos por turno
- [[OpenAI_Quota_Fallback]] — runbook (solo dispara con LLM_PROVIDER=openai)
- [[Operar_Bot]] — runbook general
