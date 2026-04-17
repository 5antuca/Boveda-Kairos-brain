---
tags: [sesion, langgraph, trebol, bot, bugs, observability, sheets, memory]
fecha: 2026-04-17
contexto: sesión extensa de bugfixing post-cutover test del bot Python
---

# Sesión 2026-04-17 — Bugs del bot Python + Observabilidad

Cronología de bugs encontrados y arreglados después de que el bot Python (LangGraph) tomó el webhook de Chatwoot test. Todo el trabajo quedó en test; prod sigue en n8n.

## Bugs resueltos en orden de descubrimiento

### 1. Saludo inicial ausente
**Síntoma**: Cliente manda "holaaaa" y el bot responde "¿con qué presupuesto contás?" sin saludar ni presentarse.

**Root cause**: Regla existente en el system prompt (línea 48: `Sin nombre + sin presupuesto → "¡Hola!..."`) pero con "EXCEPCIÓN" textual que el LLM interpretaba como opcional.

**Fix**: Reforzar con `⛔ PRIMER TURNO... SIEMPRE... PROHIBIDO responder solo '¿con qué presupuesto contás?'`. Archivo: `bot-service/configs/prompts/trebol.txt`.

**Validación**: smoke test `holaaaa` → "¡Hola! Hablás con Santi de El Trébol Automotores. ¿Cómo te llamás y con qué presupuesto contás?..." ✓

### 2. Fotos como markdown en texto
**Síntoma**: Cliente recibe el link markdown literal `![Citroën C4](https://...)` en el WhatsApp en vez de las imágenes.

**Root cause**: El bot Python ignoraba los arrays `fotos_mensajeN` del output JSON del LLM. La función `_parse_agent_response` solo concatenaba `mensaje1/2/3`, dejando las URLs como texto plano.

**Fix** (3 archivos):
- `agent/graph.py` — `_parse_agent_response` devuelve `(text, image_urls)`. Extrae markdown `![...](...)` y también URLs de `fotos_mensajeN`. Dedup con preservación de orden.
- `integrations/chatwoot_client.py` — nueva función `send_attachment(conv_id, image_url)`. Descarga la imagen vía httpx y la sube a Chatwoot vía `multipart/form-data`. Chatwoot la reenvía a Evolution → WhatsApp.
- `webhook/chatwoot.py` — después del `send_message(text)`, itera sobre `image_urls` y dispara `send_attachment` por cada una.
- `main.py` — endpoint `/test/message` también devuelve `image_urls` en JSON.

**Unit test**:
```python
from trebol_bot.agent.graph import _parse_agent_response

text, urls = _parse_agent_response('{"mensaje1":"Fotos del C4 ![f](https://a.jpg)","fotos_mensaje1":[]}')
# text = "Fotos del C4", urls = ["https://a.jpg"]
```

### 3. Buffer ×15 en n8n (no aplicable al bot Python)
**Resuelto previamente** en la misma sesión con fixes en workflow n8n. Ver [[../Trebol/bugs/bad-conv-20260417-v4-c4picasso-buffer-rag|Postmortem C4 Picasso]] y [[../Trebol/conversaciones/Malas|Malas]].

Root cause real: `Get row(s) in sheet2` devolvía 15 filas porque hay 2 nodos `Google Sheets1` y `telefono` con operation `append` **sin `matchingColumns`** → creaban row nueva en CRM por cada mensaje.

Fix n8n: append → appendOrUpdate + matchingColumns=['TEL'] + Code node nuevo "Limit First CRM Row" como defensa.

### 4. Passat ML: vehiculo sobrescrito por alternativas del LLM
Ver [[../Trebol/bugs/bad-conv-20260417-v4-passat-ml-vehiculo-sobrescrito|Postmortem]].

Relevante al bot Python porque muestra un patrón que también puede pasar acá: el LLM devuelve alternativas → el extractor de CRM las toma como `auto_interes` del cliente.

**Fix n8n aplicado** (no replicado aún en bot Python):
- Prompt extractor reforzado: no extraer de líneas "Vendedor:", lockear ML link.
- Guard determinístico en `Parser JSON CRM`.

**TODO en bot Python**: replicar el guard en `extract_and_update_crm` o en el prompt de `CRMExtraction`.

### 5. DS3 cuotas sin anticipo
Ver [[../Trebol/bugs/bad-conv-20260417-v4-ds3-cuotas-sin-anticipo|Postmortem]] y [[../../../specs/2026-04-17-trebol-v4-clasificador-cuotas-y-handoff-hardening|Spec]].

Bug del workflow n8n. No relevante para bot Python (que no tiene clasificador determinístico — el LLM decide).

### 6. Datos CRM escritos desde columna M en Sheets
**Síntoma**: En la hoja CRM, las nuevas filas del bot aparecían con FECHA en columna M (ALERTA_ENVIADA) en lugar de A.

**Root cause**: `values().append()` de Google Sheets con `range="CRM!A:M"` detecta la "tabla" automáticamente por la presencia de datos. Si hay valores en columna M aislados (ej: un ALERTA_ENVIADA en una fila huérfana) pero no en A, la API interpreta la tabla como empezando en M y escribe las nuevas filas DESDE M.

**Fix** (`integrations/sheets_client.py`): reemplazar `append` con `update` explícito calculando `next_row = max(len(rows)+1, 2)` y usando `range=f"CRM!A{next_row}:M{next_row}"`. Esto garantiza que siempre escriba empezando en A.

**Validación**: llamada directa a `update_crm(phone='5491150635028', nombre='TEST_FIX', ...)` → log `crm_row_appended row=44`, confirmado en Sheet que fila 44 empieza en A.

### 7. Observabilidad Langfuse profunda
Ver [[Observabilidad_Langfuse]].

Objetivo: "cualquier error de lógica sea identificable por una IA leyendo las trazas".

**Cambios**:
- `normalize_phone(raw) → "5491150635028"` canónico (solo dígitos)
- `session_id = user_id = normalize_phone(phone)` en todos los traces
- `metadata: {env, bot_version, client_id, chatwoot_chat_id, phone_raw, source}`
- `tags: [client_id, env:<env>, trebol-bot, channel:whatsapp]`
- `try/except` alrededor de `graph.ainvoke()` con `lf_trace.update(level="ERROR", ...)`
- **Removed @observe de los 3 tools** — creaban traces sueltas con `session_id=None`. El CallbackHandler ya traza tool calls como spans anidados.

**Sessions en Langfuse**: antes estaban fragmentadas (`trebol:test-2843882-6463`, `trebol:75`, etc.). Ahora todas agrupadas bajo `5491150635028`.

## Archivos tocados en esta sesión

| Archivo | Cambios |
|---|---|
| `bot-service/configs/prompts/trebol.txt` | ⛔ PRIMER TURNO — saludo obligatorio |
| `bot-service/trebol_bot/agent/graph.py` | `_parse_agent_response` devuelve tuple + error handling + `langfuse_context` link |
| `bot-service/trebol_bot/agent/tools.py` | Removed @observe (comentario explicando por qué) |
| `bot-service/trebol_bot/integrations/chatwoot_client.py` | Nueva `send_attachment()` con multipart upload |
| `bot-service/trebol_bot/integrations/sheets_client.py` | append → update con next_row explícito |
| `bot-service/trebol_bot/webhook/chatwoot.py` | Iterar attachments + `normalize_phone` + metadata/tags ricos + error handling |
| `bot-service/trebol_bot/observability.py` | Nueva `normalize_phone()` helper |
| `bot-service/trebol_bot/config.py` | `env` + `app_version` settings |
| `bot-service/trebol_bot/main.py` | `/test/message` devuelve `image_urls` |

## Gaps conocidos (backlog)

### Bot Python
- [ ] Handoff duro (Redis bot_off flag + early gate) — actualmente es "soft" (prompt dice "SILENCIO" si estado=handoff, el LLM puede ignorarlo)
- [ ] Clasificador determinístico previo al LLM (para categorías como `oferta_precio`, `papeles`, `permuta` — hoy todo decide el LLM)
- [ ] Guardia permuta con state machine persistente (hoy depende del prompt)
- [ ] Barrido de traces Langfuse viejas (~84 quedan del formato `trebol:test-*`). Script corre pero hit rate limit. TODO: usar bulk delete API si existe, o script con delay 3s.

### n8n (test, para promover a prod)
Ver [[../../../specs/2026-04-17-trebol-v4-clasificador-cuotas-y-handoff-hardening|spec completa]].

- [ ] Clasificador: agregar keywords `simulación`, `haceme simulación`, `cómo quedarían`
- [ ] Evaluar Alerta: `.value` → `.propertyName` en read de Redis offered_contact
- [ ] Sub-workflow `calcular_cuotas`: guard `anticipo <= 0` + `anticipo < minimo`

### Prod (bundle a promover cuando se decida)
10 cambios en test que no están en prod:
1. Webhook responseMode onReceived
2. If filtro message_type_num
3. Construir Instrucción anticipo pre-fill
4. Google Sheets1 → appendOrUpdate + TEL match
5. telefono → appendOrUpdate + TEL match
6. Limit First CRM Row (code node nuevo)
7. Marcar Alerta Enviada x4 → tv 4.7→4.5
8. Extraer Datos CRM prompt reforzado (ignorar Vendedor:, lockear ML)
9. Parser JSON CRM guard `PROTECCIÓN VEHICULO DE INTERÉS`
10. Evaluar Alerta `frasesOfertaCondicional` extendida (+14 variantes)

## Links

- [[LangGraph_Bot]] — overview del proyecto Python
- [[Observabilidad_Langfuse]] — guía de debugging con Langfuse
- [[../Trebol/conversaciones/Malas|Malas]] — índice de bad conversations
- [[../../../specs/2026-04-17-trebol-v4-clasificador-cuotas-y-handoff-hardening]] — spec n8n pendiente
