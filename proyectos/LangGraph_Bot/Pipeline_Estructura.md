---
tags: [proyecto, langgraph, fangiocrm, pipeline, estructura, canonico]
fecha: 2026-05-01
estado: vigente — fuente de verdad técnica del agente
branch: bot-rollback-2026-04-18
base_commit: 7f1e5c2 (2026-04-18 16:00 UTC)
---

# Pipeline y estructura del agente de respuestas — FangioCRM

> Este doc describe la **estructura técnica exacta** del agente de respuestas que sirve hoy a Trebol/test y va a ser el motor de respuestas de FangioCRM. Es la fuente de verdad — leelo antes de proponer cambios. Si el código contradice este doc, el doc está desactualizado.

## Contexto histórico breve

- **Origen**: cutover del 18-abril-2026 (`feat(prod): cutover — bot Python LangGraph activo en PROD`). Reemplazó al bot LangChain en n8n.
- **Rollback**: 1-mayo-2026, vuelta a `7f1e5c2` como base limpia. Las iteraciones intermedias (Sales Swarm, multi-LLM, Token Optimization, principios canónicos v1/v2) se archivaron — ver `_archivado/README.md`.
- **Cambios post-rollback** en branch `bot-rollback-2026-04-18`:
  - `5d8f1a7` — `mongo_collection: propiedades-test` (no se revirtió por colección rota).
  - `0f164cf` — identidad "Autos Norte" + cualificación sin presupuesto al inicio.

---

## 1. Stack

| Capa | Tecnología |
|---|---|
| Lenguaje / Framework | Python 3.11 + FastAPI + LangGraph + LangChain |
| LLM principal | OpenAI `gpt-4.1-mini` directo (sin factory multi-provider) |
| Embeddings | OpenAI `text-embedding-ada-002` |
| Memoria (Redis) | aioredis — history, debounce, bot_off, dedup fotos |
| Inventario | MongoDB Atlas Vector Search (colección `propiedades-test`) |
| Observabilidad | Langfuse (traces + spans anidados via CallbackHandler) |
| I/O canal | **Entrada**: webhook Chatwoot · **Salida**: Chatwoot API → Evolution API → WhatsApp |
| Audio in | Whisper (`integrations/audio_transcribe.py`) — transcribe audio del cliente |
| Audio out | ElevenLabs TTS (`integrations/tts_elevenlabs.py`) — responde con audio cuando flag `audio_mode` activo. Ver [[Audio_Mode_Roadmap]] |
| CRM externo | Google Sheets (gid=0, doc `11UPoPNzKcGdSuqieFtWHP9ETQNOJUxyUpQJ24kuApCc`) |
| Alertas | n8n webhook (`integrations/alertas_client.py`) |

Container: `trebol-test-bot` (Docker Compose, env `environments/test/trebol/`).
Endpoint público: `https://test-trebol.bot.kairosaisolutions.com`.

---

## 2. Endpoints HTTP (FastAPI — `trebol_bot/main.py`)

| Método | Path | Uso |
|---|---|---|
| `GET` | `/health` | Health check (Docker + Traefik). |
| `POST` | `/webhook/chatwoot` | **Entrada principal** — Chatwoot envía aquí cada message_created. |
| `POST` | `/test/message` | Endpoint sync para test/dev sin pasar por Chatwoot. |
| `POST` | `/test/clear-memory` | Limpia history + crm_state + bot_off para un phone. |

---

## 3. Pipeline end-to-end

```
Cliente WhatsApp
  │
  ▼
Evolution API ──→ Chatwoot ──webhook──→ POST /webhook/chatwoot
                                              │
                                              ▼
                              ┌─────────────────────────────────┐
                              │  webhook/chatwoot.py            │
                              │  handle_chatwoot_event()        │
                              └─────────────────────────────────┘
                                              │
   ── FILTROS DE ENTRADA (descartes silenciosos) ──
                              │
        ┌─────────────────────┼──────────────────────┐
        │                     │                      │
   1. ¿event=message_created? 2. ¿incoming?     3. ¿inbox del cliente?
   4. ¿no es grupo @g.us?     5. ¿no está bot_off? (Redis flag 72h)
                              │
                              ▼
   ── ENRIQUECIMIENTO (sobre el content) ──
                              │
        ┌─────────────────────┼──────────────────────┐
        │                     │                      │
    Audio attachment? → Whisper → reemplaza content  │
    Photo attachment? → marca content + alerta foto a vendedor
                              │
                              ▼
                    ┌─────────────────────────┐
                    │  DebounceManager        │
                    │  buffer 3s + lock       │
                    └─────────────────────────┘
                              │
                              ▼ (callback dispara cuando cierra ventana)
                    ┌─────────────────────────┐
                    │  _process_and_send()    │
                    └─────────────────────────┘
                              │
   ── PRE-LLM (en agent/graph.py::handle_message) ──
                              │
        ┌─────────────────────┼──────────────────────┐
        │                     │                      │
    Load history (Redis)   Load CRM state         Fetch dolar_blue
    7d TTL                 (state.py)             (Bluelytics)
                              │
                              ▼
                    build_estado_calificacion()
                    → string ESTADO ACTUAL para inyectar en prompt
                              │
                              ▼
                    ┌─────────────────────────┐
                    │  LangGraph (compile)    │
                    │  START→agent→tools→END  │
                    └─────────────────────────┘
                              │
   ── POST-LLM ──
                              │
        ┌─────────────────────┼──────────────────────┐
        │                     │                      │
    _parse_agent_response()   Send bubbles a Chatwoot  Update history Redis
    (JSON → mensajes[]+urls)  (delay 0.4s entre)      (si send OK)
                              │
                              ▼
                    ┌─────────────────────────┐
                    │  Async fire-and-forget  │
                    │  extract_and_update_crm │
                    └─────────────────────────┘
                              │
   ── CRM EXTRACTOR (paralelo, no bloquea respuesta) ──
                              │
        ┌─────────────────────┼──────────────────────┐
        │                     │                      │
    LLM extracción            Update Sheets          Dispatch alertas
    (CRMExtraction Pydantic)  (sheets_client)        (lead_caliente, handoff,
                                                      papeles, etc.)
```

---

## 4. LangGraph — el grafo

`bot-service/trebol_bot/agent/graph.py:build_graph()`

```python
builder = StateGraph(AgentState)
builder.add_node("agent", agent_node)
builder.add_node("tools", tool_node)

builder.add_edge(START, "agent")
builder.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
builder.add_edge("tools", "agent")  # loop hasta que el LLM responda sin tool_calls
```

### State (TypedDict)

```python
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    client_id: str
    chat_id: str
    phone: str
    estado_calificacion: str  # inyectado al system prompt en runtime
```

**Solo 5 campos.** No hay variables tipadas para lead_data, vehiculos_mostrados, etapa_funnel — eso vive afuera (Redis CRM state + history).

### `agent_node`

1. Construye LLM `ChatOpenAI(model, temperature, key).bind_tools(TOOLS)`.
2. Llama `load_system_prompt(client_id, estado_calificacion)` que lee `configs/prompts/{client_id}.txt` y reemplaza el placeholder `{ESTADO_CALIFICACION}`.
3. Invoca `llm.invoke([SystemMessage(prompt), *state["messages"]])`.
4. Devuelve `{"messages": [response]}`.

### `tool_node`

Itera `last_message.tool_calls`, mapea por nombre a la función Python correspondiente, ejecuta `tool_fn.invoke(args)`, devuelve `ToolMessage[]`.

### `should_continue` (router)

```python
def should_continue(state):
    last = state["messages"][-1]
    return "tools" if (hasattr(last, "tool_calls") and last.tool_calls) else END
```

---

## 5. Tools del LLM (3 únicas)

`bot-service/trebol_bot/agent/tools.py`

| Tool | Args | Devuelve | Lógica clave |
|---|---|---|---|
| `buscar_inventario_autos` | `query: str`, `techo_usd: float?`, `tipo_vehiculo: str?` | Fichas formateadas con marca/modelo/año/km/precio/anticipo/fotos | Cascade: 1) match determinístico MARCA+MODELO + año, 2) sin año, 3) marca+modelo, 4) solo marca, 5) vector search. Filtro post por `tipo_vehiculo` y `techo_usd` (solo en vector search). Whitelist de marcas conocidas para no confundir queries genéricas. |
| `calcular_cuotas` | `precio_contado_usd: float`, `anticipo_usd: float` | Plan de cuotas en string | Fórmula Python + dolar blue (cache Bluelytics). |
| `opciones_financiacion` | — | Texto hardcodeado con bancos + tasa propia | Constante `OPCIONES_TEXTO`. |

Las tools leen `client_id` del `ContextVar current_client_id` (seteado en `graph.handle_message()`) → permite multi-tenant sin parámetros explícitos.

---

## 6. Memoria Redis

| Key | TTL | Propósito | Setter |
|---|---|---|---|
| `bot:{client_id}:{phone}:history` | 7 días | Lista JSON de mensajes (BaseMessage serializados) | `RedisMessageHistory.aadd_messages` |
| `bot:{client_id}:{phone}:crm_state` | 7 días | CRM extraído (nombre, presupuesto, vehiculo_interes, permuta, financia, estado, handoff) | `state.save_crm_state` |
| `bot:{client_id}:{chat_id}:buffer` | 120s | Lista LPUSH del DebounceManager — agrupa mensajes consecutivos | `DebounceManager.on_message` |
| `bot:{client_id}:{chat_id}:processing` | 120s | Lock que evita LLM concurrente en mismo chat | `DebounceManager.on_message` |
| `bot:{client_id}:{phone}:bot_off` | 72h | Flag de handoff — bloquea mensajes hasta expirar | `bot_off.set_bot_off` |
| `bot:{client_id}:{phone}:photos_sent` | 7d | Set de URLs de fotos ya enviadas (dedup) | `chatwoot.py post-LLM` |
| `bot:{client_id}:{phone}:alerta_foto` | 30min | Dedup de alertas de "cliente envió foto" | `chatwoot.py incoming photos` |
| `bot:{client_id}:{phone}:audio_mode` | 15min | Flag de modo audio (cliente dijo "manejando" / "no puedo escribir") — bot responde con TTS hasta TTL o frase OFF | `memory/audio_mode.py` |

**Limpieza manual**: `bash scripts/clear-chat-memory.sh <phone>` — borra todas las keys `bot:*:{phone}:*` + history Postgres + row CRM Sheets.

---

## 7. CRM extractor (async post-respuesta)

`bot-service/trebol_bot/agent/crm.py::extract_and_update_crm()`

Disparado en background fire-and-forget tras enviar la respuesta. Pasos:

1. Construye summary del history (`_history_summary`).
2. Llama LLM separado con schema Pydantic `CRMExtraction`:
   ```
   nombre, presupuesto, vehiculo_interes, vehiculo_entrega, financia,
   estado (consultando | calificado | caliente | handoff), motivo_handoff
   ```
3. Mergea con CRM state previo (preserva campos ya conocidos — no sobrescribe).
4. `save_crm_state` en Redis (TTL 7d).
5. **Update Google Sheets** (`integrations/sheets_client.py` — gid=0, identifica row por phone).
6. `_dispatch_alert()` decide si manda alerta a `alertas_client`:
   - `lead_caliente` cuando estado=caliente.
   - `papeles` cuando vehiculo_entrega + permuta detallada.
   - `handoff` cuando estado=handoff o motivo_handoff explícito.
   - Guard de dedup: lee Sheets `ALERTA_ENVIADA` y `ALERTA_TIPO_ENVIADO` para no re-alertar.

---

## 8. Webhook Chatwoot — gates de entrada

`bot-service/trebol_bot/webhook/chatwoot.py::handle_chatwoot_event()`

Orden de gates (descarta silenciosamente — sin loggear como error):

1. `event != "message_created"` → skip.
2. `message_type != "incoming"` → skip.
3. Identifier termina en `@g.us` → mensaje de grupo, skip.
4. `conversation.inbox_id != client_cfg.chatwoot_inbox_id` → otro tenant, skip.
5. `is_bot_off(phone, client_id)` → flag Redis activo, skip.
6. content vacío tras audio fallido → skip.

**Pre-procesamiento** (sobre content):
- Audio → Whisper transcribe → reemplaza content.
- Foto → vision classifier (`gpt-4.1-mini` multimodal) describe lo que se ve (marca, modelo, año, source: screenshot/raw_photo) → marker rico inyectado al content. Detalles en [[Vision_Classifier]]. Alerta `tipo_alerta=foto` se dispara igual (con dedup 30min).
- Si solo audio sin transcribir → handoff directo a admin (frase fija + bot_off + alerta).
- Si vision classifier falla → handoff directo a admin (mensaje fijo + bot_off + alerta `lead_caliente`).

Si pasa todos los gates → `DebounceManager.on_message(callback=_process_and_send)`.

---

## 9. System prompt (loader)

`bot-service/trebol_bot/agent/prompts.py::load_system_prompt(client_id, estado_calificacion)`

1. Lee `configs/prompts/{prompt_file}` (path desde yaml del cliente).
2. Reemplaza placeholder `{ESTADO_CALIFICACION}` con el bloque construido por `state.build_estado_calificacion()`.
3. Devuelve string final.

**El prompt actual** (`configs/prompts/trebol.txt`, 312 líneas) tiene:
- ROL, SEGURIDAD, IDIOMA (voseo), ENCODING.
- 3 PRINCIPIOS CRÍTICOS (anti-alucinación, no redundancia, fallback admin).
- Bloque `{ESTADO_CALIFICACION}` dinámico.
- RECONOCIMIENTO DE INTENT.
- PRIMER TURNO / CHARLA INICIAL — orden estricto: modelo → estado → uso → presupuesto (último recurso).
- FLUJO COMPRA + PRESUPUESTO con 3 casos (cubre contado / cubre anticipo / no cubre).
- PERMUTA, FINANCIACIÓN, FOTOS, DERIVACIÓN A ADMIN.
- Frase canónica handoff (trigger técnico de bot_off): *"Ya le paso la info a administración para que te contacten y cerremos esto. Gracias por la paciencia."*
- Output JSON: `{mensaje1, fotos_mensaje1, mensaje2, fotos_mensaje2, mensaje3, fotos_mensaje3}` — 3 bubbles separadas.

---

## 10. Configuración por cliente (`ClientConfig`)

`bot-service/trebol_bot/client_config.py`

```python
@dataclass(frozen=True)
class ClientConfig:
    client_id: str
    nombre_agente: str           # "Santi"
    nombre_agencia: str          # "Autos Norte"
    ubicacion: str               # "Av. Maipú 2380, Olivos"
    horario: str
    prompt_file: str             # "prompts/trebol.txt"
    llm_model: str = "gpt-4.1-mini"
    llm_temperature: float = 0.2
    mongo_collection: str = "propiedades-test"
    sheets_crm_doc_id: str
    sheets_crm_gid: int = 0
    sheets_pedidos_gid: int = 2004343376
    debounce_seconds: float = 3.0
    chatwoot_inbox_id: int = 0   # 0 = aceptar todos
```

Cargado vía `get_client_config(client_id)` con `lru_cache`. Configuración real en `bot-service/configs/{client_id}.yaml`.

**Nota multi-tenant**: hoy `nombre_agencia`, `ubicacion`, etc. están en YAML pero NO se inyectan al system prompt (el prompt los tiene hardcodeados como literal). Cualquier multi-tenant futuro requiere parametrizar el prompt con placeholders adicionales (`{NOMBRE_AGENCIA}`, `{UBICACION}`, `{HORARIO}`).

---

## 11. Estructura de archivos

```
bot-service/
├─ Dockerfile
├─ requirements.txt
├─ configs/
│  ├─ trebol.yaml                        # config Trebol/test (Autos Norte)
│  └─ prompts/
│     └─ trebol.txt                      # system prompt (312 líneas)
└─ trebol_bot/
   ├─ main.py                            # FastAPI + lifespan + endpoints
   ├─ config.py                          # Settings (env vars, Pydantic)
   ├─ client_config.py                   # ClientConfig (yaml loader)
   ├─ context.py                         # ContextVar current_client_id
   ├─ observability.py                   # Langfuse client + normalize_phone
   ├─ webhook/
   │  └─ chatwoot.py                     # gates de entrada + handle_chatwoot_event + _process_and_send
   ├─ agent/
   │  ├─ graph.py                        # StateGraph + agent_node + tool_node + handle_message
   │  ├─ tools.py                        # 3 tools del LLM
   │  ├─ state.py                        # CRM state Redis + build_estado_calificacion
   │  ├─ crm.py                          # extractor async + dispatch alertas
   │  └─ prompts.py                      # load_system_prompt
   ├─ memory/
   │  ├─ redis_client.py                 # singleton aioredis
   │  ├─ chat_history.py                 # RedisMessageHistory (history JSON)
   │  ├─ debounce.py                     # DebounceManager (buffer + lock)
   │  └─ bot_off.py                      # set/is/clear bot_off Redis flag
   └─ integrations/
      ├─ chatwoot_client.py              # send_message + send_attachment
      ├─ alertas_client.py               # POST a webhook n8n de alertas
      ├─ audio_transcribe.py             # Whisper API
      └─ sheets_client.py                # update Sheets row CRM
```

---

## 12. Lo que el agente NO tiene (referencias para no caer en mitos)

- **No tiene** Profiler / Sales Swarm / personas (EXPLORADOR/WORK_MACHINE/PASSION_DRIVE).
- **No tiene** factory multi-LLM (Groq, Gemini) — solo OpenAI directo.
- **No tiene** `psicoperfil_bloque` en el state.
- **No tiene** filtro de segmento determinístico en tools (Hilux↔Corolla).
- **No tiene** guard anti re-saludo determinístico (depende solo del prompt).
- **No tiene** `_ensure_question_last` (orden de bubbles depende del LLM).
- **No tiene** `psicoperfil_bloque` ni placeholder `{PSICOPERFIL_BLOQUE}` en el prompt.
- **No tiene** `techo_usd_actual` como campo del state (solo string en `estado_calificacion`).
- **No tiene** invitación a venir 5.B como modo de cierre dedicado.

Si alguno de estos viene como pedido, evaluar si hay que reintroducirlo desde el v2 archivado o re-implementarlo desde cero según las necesidades de FangioCRM.

---

## 13. Comandos operativos

```bash
# Logs en vivo
docker logs -f trebol-test-bot

# Rebuild + recreate (cuando se cambia código o prompt)
cd environments/test/trebol
docker compose build trebol-test-bot
docker compose up -d --no-deps --force-recreate trebol-test-bot

# Limpiar memoria de un teléfono
bash scripts/clear-chat-memory.sh 5491150635028

# Test endpoint sin Chatwoot (sync)
curl -X POST http://localhost:8000/test/message \
  -H 'Content-Type: application/json' \
  -d '{"phone":"5491150635028@s.whatsapp.net","content":"hola"}'
```

---

## 14. Checklist mental antes de modificar el agente

1. ¿El cambio es prompt o código? Prompt = solo rebuild. Código = rebuild + recreate.
2. Si cambia el behavior del agente → limpiar memoria del test phone (las keys Redis viejas pueden corromper la prueba).
3. Si toca multi-tenant → verificar que `client_id` siga propagándose por ContextVar.
4. Si toca secrets → `.env`, NO el código. Mencionar en `.env.example`.
5. Si toca un cambio de comportamiento "filosófico" del bot → documentar el rationale acá o en doc satélite (no perderlo en logs de commit).

---

## Links

- `bot-service/` (código fuente)
- `bot-service/configs/trebol.yaml` (config de instancia)
- `bot-service/configs/prompts/trebol.txt` (prompt — fuente de verdad del comportamiento)
- [[Operar_Bot]] — operativa día a día
- [[Observabilidad_Langfuse]] — cómo leer traces
- [[Onboarding_Nuevo_Cliente]] — checklist sumar tenant
- [[_archivado/README]] — qué se archivó y por qué
