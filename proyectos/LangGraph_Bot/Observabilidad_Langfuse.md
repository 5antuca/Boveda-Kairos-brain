---
tags: [langgraph, bot, langfuse, observability, debugging, trebol]
fecha: 2026-04-17
estado: aplicado en test
---

# Observabilidad profunda — Langfuse en el bot Python

Objetivo: que cualquier error de lógica o de tools sea identificable y reparable por una IA leyendo las trazas. Toda la historia de un usuario en **una sola sesión**.

## Principios

1. **Session ID canónico por usuario** — solo dígitos del teléfono. Elimina fragmentación entre tests/WhatsApp/chat_ids rotativos.
2. **User ID = Session ID** — mismo identificador para ambos. Facilita filtros en Langfuse UI.
3. **Metadata rica** — env, bot_version, client_id, chatwoot_chat_id, phone_raw, source. Suficiente para filtrar/debuggear sin abrir trace.
4. **Tags estructurados** — `[client_id, env:test, trebol-bot, channel:whatsapp]`.
5. **Errores en la traza, no en logs** — excepciones del grafo o send suben a `lf_trace.update(level="ERROR", status_message=...)`.
6. **Tools vía CallbackHandler, NO @observe** — `@observe` creaba traces sueltas sin `session_id`. El `LangfuseCallbackHandler` ya registra cada tool call como span anidado con input/output.

## Función clave — `normalize_phone`

Archivo: `bot-service/trebol_bot/observability.py`

```python
def normalize_phone(raw: str | None) -> str:
    if not raw:
        return "unknown"
    digits = re.sub(r"\D", "", str(raw))
    return digits or "unknown"
```

Casos cubiertos:
| Entrada | Salida |
|---|---|
| `5491150635028@s.whatsapp.net` | `5491150635028` |
| `+5491150635028` | `5491150635028` |
| `5491150635028` | `5491150635028` |
| `54 9 11 5063-5028` | `5491150635028` |
| `""` / `None` | `"unknown"` |

## Estructura del trace en Langfuse

```
TRACE: whatsapp_turn
  session_id: 5491150635028              ← solo dígitos, canónico
  user_id:    5491150635028              ← mismo
  tags:       [trebol, env:test, trebol-bot, channel:whatsapp]
  metadata:   {
    env: "test",
    bot_version: "0.3.0",
    client_id: "trebol",
    chatwoot_chat_id: "75",
    phone_raw: "5491150635028@s.whatsapp.net",   // por si necesitás el original
    source: "chatwoot_webhook"
  }
  input:      {message, history_turns}
  │
  ├── SPAN: LangGraph run (auto — CallbackHandler)
  │     ├── agent_node → LLM call (ChatOpenAI)
  │     │     └── GENERATION: tokens in/out, system prompt, messages
  │     ├── tool_node
  │     │     ├── SPAN: buscar_inventario_autos  (input: query + techo_usd, output: fichas)
  │     │     ├── SPAN: calcular_cuotas          (input: precio + anticipo, output: cuotas)
  │     │     └── SPAN: opciones_financiacion    (output: texto)
  │     └── agent_node → LLM call #2 (con resultados)
  │
  ├── SPAN: response_sent
  │     output: {preview, attachments: N}
  │
  ├── SPAN: crm_extraction (async, aparece ~1s después)
  │     output: {nombre, vehiculo, estado, tipo_alerta, ...}
  │
  └── (si hubo error)
        level: "ERROR"
        status_message: "HTTPError: 500"
        output: {error, exception_type}
```

## Puntos de integración por archivo

### `observability.py`
- Singleton cliente Langfuse (`@lru_cache`).
- `normalize_phone()` exportado.

### `webhook/chatwoot.py`
```python
user_pid = normalize_phone(phone)
lf_trace = lf.trace(
    name="whatsapp_turn",
    session_id=user_pid,
    user_id=user_pid,
    metadata={..., "phone_raw": phone, ...},
    tags=[client_id, f"env:{env}", "trebol-bot", "channel:whatsapp"],
)
lf_handler = CallbackHandler(stateful_client=lf_trace)

try:
    response, image_urls = await handle_message(..., lf_handler=lf_handler, save_history=False)
except Exception as e:
    lf_trace.update(level="ERROR", status_message=..., output={"error": str(e)})
    raise
```

### `agent/graph.py`
Dos responsabilidades:

1. Si `lf_handler is None` (viene de `/test/message`), crear un `LangfuseCallback` nuevo con la misma estructura.
2. Si viene con `lf_handler`, linkear `langfuse_context.update_current_trace(session_id, user_id)` antes de `ainvoke` para que los spans hereden los IDs.
3. Try/except alrededor de `graph.ainvoke()` que actualiza el trace padre con `level="ERROR"` antes de re-raisear.

### `agent/tools.py`
**Sin `@observe`**. El `CallbackHandler` ya traza los tool calls automáticamente. El intento anterior creaba traces duplicadas sin session_id (aparecían como "(none)" en Langfuse).

## Cómo debuggear desde Langfuse

### 1. "Bot respondió raro a fulano"
1. UI → Sessions → buscar por `5491150635028` (solo dígitos) → ver conversación completa (todos los turnos)
2. Abrir el turno problemático → ver system prompt completo + history + tool calls + LLM output
3. Comparar con turnos previos: ¿qué cambió en el estado entre un turno y otro?

### 2. "Un tool está devolviendo mal"
1. Filtrar por `tags: trebol-bot` + rango de tiempo
2. Abrir trace → expandir span `buscar_inventario_autos` → ver input (`query`, `techo_usd`) y output
3. Si output es `[]` pero sabés que hay stock → problema en la query del LLM o en el filtro de precio

### 3. "El bot crasheó"
1. Filtrar por `level: ERROR` en traces
2. El trace va a tener `status_message` con tipo de excepción + snippet
3. `output.exception_type` y `output.error` → stack trace exacto

### 4. Verificar que TODO caiga bajo un solo user
Langfuse → Users → `5491150635028` debería listar todas las sesiones.

Si ves:
- `trebol:test-xxx-yyy` → basura vieja del formato pre-fix 2026-04-17
- `5491150635028@s.whatsapp.net` → sin normalizar (pre-fix)
- `+5491150635028` → sin normalizar (pre-fix)

Esas son trazas históricas; las NUEVAS caen todas bajo `5491150635028`.

## Gotchas

- **`@observe()` dentro de tools llamadas por LangChain** → crea trace separada con `session_id=None` a menos que uses `langfuse_context.update_current_trace` ANTES de la invocación. Con `CallbackHandler` pasado en `config["callbacks"]`, los tool calls ya están cubiertos. **No mezclar las dos mecánicas.**
- **Rate limit Langfuse Cloud Free** — ~40 req/min para DELETE de traces. Para barridos masivos, `sleep 3` entre requests.
- **`session_id` nunca debe venir del `chat_id` de Chatwoot** — Chatwoot rota `conversation_id` si el cliente inicia nueva conversación; perdés continuidad. Usá siempre el teléfono.
- **El trace padre es responsable del `session_id`**. El `CallbackHandler` no tiene forma de setearlo por su cuenta si no hay trace padre con `stateful_client=trace`.

## Tags convenciones

| Tag | Propósito | Ejemplo |
|---|---|---|
| `<client_id>` | identificar cliente | `trebol`, `mv_autos` |
| `env:<env>` | ambiente | `env:test`, `env:prod` |
| `<bot_name>` | nombre del bot | `trebol-bot`, `fangio-bot` |
| `channel:<channel>` | canal de entrada | `channel:whatsapp`, `channel:instagram` |
| `source:<source>` | origen del trace | `source:test_endpoint` (cuando vino del harness), sin prefijo cuando viene del webhook |

## Config env vars

- `LANGFUSE_PUBLIC_KEY` — pk-...
- `LANGFUSE_SECRET_KEY` — sk-...
- `LANGFUSE_HOST` — https://us.cloud.langfuse.com (o self-hosted)
- `ENV` — `test` | `prod` (se inyecta como tag y metadata)
- `APP_VERSION` — versión del bot para correlacionar con deploys

## Links

- [[LangGraph_Bot]] — proyecto principal
- [[Sesion_2026-04-17_Bugs_y_Observabilidad]] — postmortem de la sesión
- Langfuse dashboard: https://us.cloud.langfuse.com
