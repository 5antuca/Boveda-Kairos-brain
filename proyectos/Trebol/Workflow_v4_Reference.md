# Trebol v4 — Workflow Reference

**Archivo**: `workflows/trebol_v4_test.json` | **ID test**: `chkkStDHenGFhwE7` | **ID prod**: `wf4ts1WKcpOaE90A__FkD`
**Nodos**: 141 (139 + 2 de F3.1 drift detector) | **LLM**: gpt-4.1-mini | **Formatter**: gpt-4.1-nano | **System prompt source**: `prompts/trebol_v4_system_prompt.txt`

---

## Pipeline (3 LLM calls por mensaje)

```
Webhook → Normalizar → Clasificador → Construir Instrucción (Code)
  → Check Primer Mensaje → Construir Estado CRM
  → IF Guardia Activa:
      true  → Handler Guardia (Code) → Guardia Save Chat ───┐
      false → AI Agent → Basic LLM Chain ───────────────────┤
                                                             ↓
                                                     Parse Chain Output
                                                             ↓
                                       Evaluar Alerta → IF Ficha Mostrada → Redis SET ficha_enviada
                                                             ↓
                                       Code1/2/3 (fotos) → HTTP (send)
                                                             ↓
                                       Extraer Datos CRM (post) → Sheets update
```

## Debounce (Redis)

```
Webhook → Redis LPUSH {chat_id}:buffer → Wait 3s → LRANGE → ¿Soy primero?
  → SI: Redis SET {chat_id}:processing (lock 120s TTL) → flujo normal
  → NO: descarta
```

En paralelo desde `Inyectar Conversión Pesos`: Buscar Cliente CRM + Redis GET ficha_enviada + Buscar Pedido.

## Clasificador (determinístico, 9 categorías)

| Categoría | Ruta |
|-----------|------|
| `comercial` | → Construir Instrucción → Check Primer Mensaje (AI Agent) |
| `compra` | → Construir Instrucción → Check Primer Mensaje |
| `cuotas` | → Construir Instrucción → Check Primer Mensaje |
| `financiacion` | → Construir Instrucción → Check Primer Mensaje |
| `catalogo_ml` / `catalogo_ml_financiacion` | → Construir Instrucción → Check Primer Mensaje |
| `saludo_puro` | → saludo → enviar (path corto, sin AI Agent) |
| `papeles` / `administracion` | → auto-respuesta → alerta → Bot OFF |

## Sistema de Guardias (bypass determinístico)

`Construir Estado CRM` calcula `guardia_tipo` → `IF Guardia Activa` rutea:

```
IF Guardia Activa
  true  → Handler Guardia (Code) → Guardia Save Chat ──┐
  false → AI Agent → Basic LLM Chain ──────────────────┤
                                                        ↓
                                                 Parse Chain Output
```

`Handler Guardia` maneja todos los tipos en un solo Code node:
- `presupuesto` → pide nombre + presupuesto
- `permuta` → recopila año/km/estado/fotos del auto a entregar
- `pedido` → ofrece anotarse en lista de espera
- `permuta_completa` → confirma datos + trigger alerta vendedor
- `noResponder` → suprime respuesta (cierre)
- `anticipo_derivacion` → confirma derivación (cliente dice "sí" a "¿te pongo en contacto?")
- `anticipo_insuficiente` → anticipo del cliente < mínimo del vehículo → mensaje determinístico + oferta derivación

**Dedup**: si el bot ya envió el mismo mensaje exacto en `ultimo_msg_bot`, Handler Guardia lo suprime (cantidad=0).

**Prioridad de evaluación en Construir Estado CRM:**
```
noResponder > permuta_completa > pedido > permuta > anticipo_derivacion > anticipo_insuficiente > presupuesto > null (AI Agent)
```

### Guardia Permuta

Cuando `entregaEfectiva=true && nombreEfectivo=true`, recopila secuencialmente:
1. año → 2. km → 3. estado → 4. fotos → todo completo → `permuta_completa` → alerta vendedor

Detección: regex + análisis de `ultimo_msg_bot` (si bot preguntó km, la respuesta IS el km).
`compraDirectaConfirmada`: `/compra directa|sin permuta|no tengo para entregar/i` → no pregunta permuta.

### Guardia Pedido

Cuando AI Agent dice "no tenemos X en stock", combina preguntas según datos faltantes:
- !nombre && !presupuesto → "¿Cómo te llamás y con qué presupuesto contás?"
- Ambos datos → "[Nombre], te podemos anotar para avisarte cuando ingrese [vehículo]."
- `pedidoYaRegistrado` (Sheets Pedidos): si TEL ya existe → no re-ofrece.

Regex: `botYaOfrecioPedido` = `/anot\w*\s+(?:para\s+)?avisarte/i`

### Selección de vehículo (F100)

- 1 ficha mostrada → auto-selección (`vehiculoEfectivo = true`)
- 2+ fichas → guardia pregunta "¿Cuál de los que te mostré te interesa?"
- `botPreguntVehiculo` → deja pasar al AI Agent para procesar selección

## Context Compression (state machine lite)

Inspirado en el patrón LangGraph/state machine: en vez de depender solo del historial crudo de Postgres,
`Construir Estado CRM` genera un **resumen comprimido del estado** inyectado al AI Agent como contexto.

**Dos bloques inyectados en el system prompt del AI Agent:**

1. `contexto_conversacional` — estado comprimido (1 línea):
   ```
   [CONTEXTO DE CONVERSACIÓN — turno 3]
   Confirmados: Nombre: santi | Vehículo: Citroën C4 Picasso (ficha enviada, contado: U$S 14.800, anticipo mín: U$S 10.500) | Financia: si
   Acciones: ficha enviada
   Último del bot: "¿Cómo te llamás?"
   ```
   Incluye: datos confirmados (con precios del vehículo si ficha enviada), acciones realizadas, último mensaje del bot.

2. `estado_calificacion` — fuente de verdad con ✅/❌ + PRÓXIMO OBJETIVO.

**Resultado**: `contextWindowLength` de Postgres Chat Memory reducido de **6 → 3 mensajes** porque el contexto comprimido ya provee el estado acumulado. Menos tokens, misma información.

**Principio clave** (del análisis LangGraph): la capa determinística (regex + reglas duras) actúa como guardrail de entrada; el LLM solo se activa para lo que no puede resolverse con patrones finitos. Los datos ya capturados se comprimen en estado, no se re-extraen del historial.

## Nodos centrales

| Nodo | Función |
|------|---------|
| `Construir Instrucción` | Prepara instrucciones por categoría (reemplaza 6 Edit Fields) |
| `Check Primer Mensaje` | SQL Postgres: `msg_count`, `historial_usuario`, `ultimo_msg_bot`, `historial_bot` |
| `Construir Estado CRM` | Cerebro: calcula `guardia_tipo`, `proximoObjetivo`, detección P2, `esPosibleNombre` |
| `Handler Guardia` | Toda la lógica de guardias en 1 Code (reemplaza Switch + 6 handlers) |
| `Parse Chain Output` | Post-proc: ¡Hola! injection, anticipo gate, strip "Descripción:", no-auto-fotos, guardia post-ficha ML |
| `Evaluar Alerta` | Detecta alertas y confirmación contacto (consolida 3 nodos previos) |
| `Guardia Save Chat` | Postgres INSERT para guardia path (Chat Memory nativo solo graba AI Agent path) |
| `Extraer Datos CRM` | LLM call #1: extrae nombre/presupuesto/vehículo/entrega del mensaje |
| `Basic LLM Chain` | LLM call #3: formatter JSON |

## PRÓXIMO OBJETIVO determinístico

`Construir Estado CRM` calcula qué preguntar al cierre:

```javascript
if (pedidoYaConfirmado || pedidoYaRegistrado) → 'Buscar alternativas...';
else if (!nombreEfectivo && !presupuestoEfectivo) → 'Pedir nombre y presupuesto — CHARLA INICIAL';
else if (!nombreEfectivo) → 'Pedir solo nombre';
else if (!vehiculoEfectivo) → 'Preguntar qué vehículo busca';
else if (!entregaEfectiva && !compraDirectaConfirmada) → 'Preguntar permuta';
else if (entregaEfectiva && !presupuestoEfectivo) → 'Recopilar datos de permuta';
else → 'Todos los datos recopilados';
```

## Detección P2 (datos en mensaje actual)

Detecta datos sin esperar CRM (Sheets delay ~5-10s):
- `vehiculoEnMensaje`: modelosRegex.test(mensajeActual)
- `nombreEnMensaje`: `/me llamo|soy [A-Z]|mi nombre/i` || `esPosibleNombre`
- `permutaEnMensaje`: `/tengo (?:un|una)|para entregar|permut/i`
- `presupuestoEnMensaje`: `/tengo \d|\d.*usd|\d.*millones/i`

Fallbacks en `historialUsuario` (Postgres) para nombre y presupuesto.

### esPosibleNombre

Heurística para mensajes cortos (1-3 palabras, sin números/URLs):
- Excluye: "si por favor", "no gracias", "dale si", "por favor", "de una", "todo bien", "está bien", etc.

## Parse Chain Output (post-procesamiento)

| Lógica | Descripción |
|--------|-------------|
| ¡Hola! determinístico | Si msg_count=0 y respuesta no empieza con "Hola" → prepend `¡Hola!\n\n` |
| Ficha detection | Detecta ficha por emojis (📅+💰) O por prosa con precios (`contado...U$S` + `anticipo...U$S`). Extrae anticipo_min, contado, permuta, nombre vehículo → Redis SET ficha_enviada |
| Anticipo gate | Redis `ficha_enviada` JSON `{m: anticipo_min, v: vehiculo, c: contado, p: permuta}` — bloquea si anticipo < mínimo |
| Strip "Descripción:" | Elimina etiqueta raw del RAG |
| No-auto-fotos | Limpia arrays `fotos_mensaje*` si mensaje original no contiene keywords foto |
| Guardia post-ficha ML | Override mensaje2 para `catalogo_ml`: sin nombre→pedirlo, con permuta→"contame qué tenés", sin dato→"¿permuta o compra directa?" |

## Closure patterns (noResponder)

- Permuta completa + cierre → noResponder
- Pedido confirmado + cierre (sin "opciones/muestre" en ultimoMsgBot) → noResponder
- Pedido registrado + alternativas mostradas + cierre → noResponder

## System Prompt (~11,000 chars, ~2,750 tokens)

**Archivo fuente**: `prompts/trebol_v4_system_prompt.txt` (editado fuera de n8n, copiado al AI Agent node)

Estructura: ANTI-ALUCINACIÓN → SEGURIDAD → ROL (Santi, voseo) → **CONTEXTO CONVERSACIONAL** (dinámico) → **ESTADO CALIFICACIÓN** (dinámico) → CHARLA INICIAL → PRIORIDAD → FINANCIACIÓN → SIMULACIÓN → INTERÉS → CIERRE.

Cambios sesión 2026-04-06:
- Reducido 24% vs versión anterior (eliminadas redundancias con nodos determinísticos)
- Prioridad: responder pregunta del cliente PRIMERO, datos faltantes al final
- Financiación: PROHIBIDO agregar permuta como opción, bancaria en pesos solo si cliente pide
- Dos bloques dinámicos inyectados: `contexto_conversacional` + `estado_calificacion`

Reglas clave:
- Siempre `buscar_inventario_autos` antes de mencionar vehículo
- Matching parcial: MARCA+MODELO BASE idéntico → ES match
- Links ML → query solo MARCA+MODELO BASE
- Fotos: NUNCA automáticas, solo si cliente pide
- Presupuesto: contexto interno, NUNCA mencionarlo al cliente
- N/A global: campo vacío/0 → omitir línea

## Tools del AI Agent

| Tool | Tipo | Uso |
|------|------|-----|
| `buscar_inventario_autos` | MongoDB Vector Store (topK=8) | SIEMPRE que se mencione vehículo. Links ML → query marca+modelo base |
| `OPCIONES DE FINANCIACION` | Code node (datos hardcodeados de Sheets) | Formas de pago: contado, bancario (Supervielle/ICBC/Galicia/Columbia), privado (cuotas USD). NUNCA para calcular cuotas |
| `calcular_cuotas` | Sub-workflow (`nq3pdz31aX-61Wt17iyv6`) | Solo simulación explícita con vehículo+anticipo. Input: `{precio_contado, anticipo}` USD |
| Postgres Chat Memory | Automático | Últimos `contextWindowLength` = **3** mensajes (reducido de 6, compensado por context compression) |

## Anticipo Gate — flujo completo

```
Parse Chain Output detecta ficha (emoji 📅+💰 O prosa contado+anticipo en USD)
  → extrae anticipo_min, contado, permuta, nombre vehículo
  → IF Ficha Mostrada (loose) → Redis SET ficha_enviada {m, v, c, p}
     ↓
Siguiente turno: cliente dice monto
  → Construir Estado CRM lee Redis → compara monto vs anticipo_min
  → monto < min → guardia_tipo = 'anticipo_insuficiente'
  → Handler Guardia → "Tu anticipo no alcanza... te pongo en contacto con administración"
  → AI Agent NO corre → calcular_cuotas NO se llama
```

**Limitación multi-vehículo**: Redis guarda datos de UN vehículo (el último con ficha mostrada). Si el bot mostró 2+ vehículos y el cliente pregunta por uno específico ("cuotas del Vento"), el LLM resuelve la selección — es interpretación, no regla de negocio. El anticipo gate solo aplica cuando hay 1 vehículo claro en Redis.

## Redis Keys

| Key | TTL | Propósito |
|-----|-----|-----------|
| `{chat_id}:buffer` | — | Buffer debounce (LPUSH/LRANGE) |
| `{chat_id}:processing` | 120s | Lock de procesamiento |
| `{chat_id}:ficha_enviada` | 86400s (test) / 3600s (prod) | JSON `{m: anticipo_min, v: vehiculo}` |
| `{chat_id}:offered_contact` | 1800s | Oferta de contacto pendiente |

## Observabilidad — F3.1 LLM Drift Detector (2026-04-09, test)

`Parse Chain Output` calcula `finalJson.llm_drift_detected` cuando la respuesta del bot contiene patrones de presupuesto/tope en USD y NO hay presupuesto real disponible (ni en CRM ni en mensaje actual). Patrones:

```
/hasta\s+U\$S\s*[\d.,]+/i         → "hasta U$S N"
/opciones\s+[^.]*?U\$S\s*[\d.,]+/i → "opciones ... U$S N"
/presupuesto\s+hasta/i             → "presupuesto hasta"
/rango\s+de\s+hasta/i              → "rango de hasta"
/dentro\s+de\s+(?:los\s+)?U\$S/i  → "dentro de U$S"
```

Gate: `!presupuestoEfectivo && !presupuestoEnMensaje && !presupuestoLimpio`.

Rama paralela (3er output de Parse Chain Output, no bloquea main flow):
```
Parse Chain Output → IF LLM Drift → [true] Log Drift Event (Postgres INSERT)
                                    [false] (sin sucesor)
```

Tabla `llm_drift_events` en DB `postgres` (misma que `n8n_chat_histories`):
```sql
id SERIAL PK | created_at TIMESTAMPTZ | chat_id TEXT | exec_id TEXT | turno INT |
mensaje_cliente TEXT | respuesta_bot TEXT | patron_detectado TEXT |
crm_presupuesto TEXT | detalle JSONB (guardia_tipo, snippet, categoria)
```

Query típica para investigar drifts:
```sql
SELECT created_at, chat_id, turno, patron_detectado, respuesta_bot
FROM llm_drift_events ORDER BY created_at DESC LIMIT 20;
```

## Test harness golden — F3.2 (2026-04-09, test)

`scripts/test_conversation.sh` — regresión automatizada sin credenciales externas.

- **POST directo al webhook de n8n** con payload sintético de Chatwoot (bypass Chatwoot API).
- **Lectura de respuesta vía `execution_data`**: parsea con `flatted` desde `/usr/local/lib/node_modules/n8n/node_modules/flatted` dentro del container `trebol-test-n8n` (ver memory `reference_n8n_exec_debug.md`), extrae `Parse Chain Output` → `mensaje1/2/3`.
- **Persistencia manual de historial**: como `HTTP Request` a Chatwoot falla con conversation_id sintético y aborta el resto de la execution, `Guardia Save Chat` (rama paralela de Handler Guardia) no corre. El harness emula el INSERT en `n8n_chat_histories` después de cada turno para que el próximo turno vea msg_count>0.
- **Escenarios** (2026-04-10, 38/38 PASS):
  - `tiago` — 4 turnos regresión permuta básica (Ford Ka 2013 → 187700 → perfecto estado → ya te mando las fotos)
  - `tiago_full` — 5 turnos, conversación prod 2026-04-09 completa con anti-drift + anti-repetición km
  - `rocio` — 4 turnos, catalogo_ml + permuta Gol Power + km repetido (prod 2026-04-08)
  - `hilux` — 1 turno contrarregresión compra ("busco una hilux")
  - `matias_c3` — 2 turnos, ML link Citroën C3 + anticipo en pesos (5.500.000 ARS) insuficiente — valida Bug B/C (2026-04-10)
  - `agustina_raptor` — 2 turnos, permuta Ford Raptor + ML Everest en un solo mensaje — valida Bug D drift (2026-04-10)
- Uso: `bash scripts/test_conversation.sh [tiago|tiago_full|rocio|hilux|matias_c3|agustina_raptor|all]` · `VERBOSE=1` imprime respuesta completa.
- **Idempotencia del harness** (2026-04-10): `persist_history` compara `MAX(id)` de `n8n_chat_histories` pre/post-exec. Si el exec agregó ≥2 filas (AI Agent path vía Postgres Chat Memory), salta el INSERT manual; si agregó 0 (guardia path — Guardia Save Chat aborta por el 404 de HTTP Request), inserta las 2 filas para que el próximo turno tenga historial completo. Evita duplicados que inflaban `fichasNumeradas` y disparaban la guardia "elegir vehículo" incorrectamente.

## Notas técnicas

- **typeVersion**: Code nodes SIEMPRE `typeVersion: 1` (v2 crashea worker en n8n 2.2.4)
- **Race condition CRM**: mitigado con detección P2 + historial Postgres + nombre_detectado_guardia
- **Sin pending queue (O6)**: mensajes durante processing (~20-30s) se pierden
- **Anticipo gate (fix 2026-04-06)**: Redis `ficha_enviada` guarda JSON `{"m": anticipo_min, "v": vehiculo}` — el gate en `Parse Chain Output` ahora parsea JSON y lee `.m` (antes hacía `parseFloat()` del string JSON → NaN → gate nunca bloqueaba)
- **Financiación instrucción (fix 2026-04-06)**: `Construir Instrucción` case `financiacion` ahora inyecta instrucción explícita de llamar la tool OPCIONES DE FINANCIACION de Sheets (antes el AI inventaba opciones)
- **Alerta duplicada (FIXED 2026-04-06)**: eliminadas rutas duplicadas (If Temperatura Caliente + Switch Lead Logic). Ahora una sola ruta: If Handoff → potencial cliente alerte → Marcar Alerta Enviada3 → Set Bot Off.
- **Bot-off en lead caliente (FIXED 2026-04-06)**: consolidado en la ruta única de alertas.
- **offered_contact (2026-04-06)**: Redis key para trackear cuando el bot ofreció derivar por anticipo insuficiente. Confirmación del cliente → alerta vendedor.
- **IF Ficha Mostrada (fix 2026-04-07)**: Expresión: `$json.output.ficha_mostrada` + `typeValidation: "loose"`. Root cause: n8n 2.2.4 serializa output nested de Code node como `''` en vez de boolean — workaround con loose validation. Evaluar Alerta: referencia cambiada a `.output.anticipo_gate_fired`. Bug anterior: `$json.ficha_mostrada` → IF error → Redis SET ficha_enviada nunca corría → anticipo gate cascada rota.
- **IF Ficha Mostrada NO usa strict** (excepción a la regla de Switch nodes): la memory `feedback_switch_node_strict` aplica a Switch nodes donde `null` matchea incorrectamente. IF Ficha Mostrada es IF node con boolean simple — loose es correcto aquí.
- **Anticipo vs cuotas (pendiente)**: Cuando cliente dice anticipo < mínimo del vehículo Y pide simulación de cuotas, el AI Agent calcula cuotas igual en vez de bloquear. Necesita gate determinístico pre-calcular_cuotas: si `anticipo_cliente < anticipo_minimo_vehiculo` → mensaje "tu presupuesto no alcanza, te pongo en contacto con administración". Ver roadmap.
- **Presupuesto display (fix 2026-04-07)**: `estado_calificacion` ahora usa `presupuestoEfectivo` (con extracción de valor via `presupuestoLimpio`) además de CRM. Antes el AI Agent veía `❌ desconocido` aunque el cliente ya había dicho su presupuesto.
- **Anticipo gate guard (fix 2026-04-07)**: Parse Chain Output skipea anticipo gate cuando guardia `anticipo_insuficiente` ya manejó el mensaje (evita duplicación).
- **Parse de montos con coma-miles (fix 2026-04-10)**: `Parse Chain Output` ahora hace `replace(/[.,]/g, '')` al extraer `anticipo_min_en_ficha`, `contado_en_ficha`, `permuta_en_ficha`. Antes `"U$S 5,000"` se parseaba como `5.0` (la `,` era tratada como decimal) → Redis guardaba `m: 5` → el gate comparaba `numUSD=3971 < 5` → nunca disparaba. Ahora `"5,000"` y `"5.000"` ambos parsean como `5000`. Los anticipos son enteros, no hay decimales.
- **Eval con acento "evalúe" (fix 2026-04-10)**: `botEnMidPermuta` y `botPreguntFotos` usaban `evalu` literal en el regex, que NO matchea `evalúe` porque `u ≠ ú`. Fix: `eval[uú]e|evaluen`. Sin esto, T4 del escenario Tiago ("ya te mando las fotos") caía al AI Agent en vez de disparar `permuta_completa`.
- **ARS→USD en anticipo_insuficiente (fix 2026-04-10)**: `Construir Estado CRM` ahora detecta montos grandes en pesos (`>= 100_000`) en el mensaje del cliente y los convierte a USD con `Fetch Dólar Blue` antes de comparar contra `minimoVehiculoFicha`. Triggers ampliados: `tengo|pongo|doy|entregando|ofrezco|aporto|cuento con`. Ejemplo: "Entregando 5.500.000" con dólar blue 1385 → numUSD=3971 < 5000 → dispara `anticipo_insuficiente`.
- **Extracción de vehiculo_permuta (fix 2026-04-10)**: `Construir Estado CRM` expone `vehiculoPermuta` (best-effort via regex `tengo (?:un|una) X|para (?:vender|entregar|permutar) X|tomarán como pago X|ofrezco X`). El `systemMessage` del AI Agent recibe una regla absoluta (`⛔⛔⛔ REGLA ABSOLUTA`) que PROHÍBE mostrarlo como opción de compra, incluso si `buscar_inventario_autos` devuelve matches parciales. Resuelve el drift donde el bot muestra el Raptor del cliente en stock porque "Ford Ranger Raptor" apareció en el mensaje.
- **Permuta state machine — extracción de año/km/estado (fix 2026-04-10)**: `Construir Estado CRM` ahora extrae año (`\b(19|20)\d{2}\b`), km (`\d+\s*km|kilómetros`) y estado (`sin detalles|impecable|casi nueva|perfecto estado|excelente|inmaculado|como nuevo|buen estado|mal estado|regular`) del `textoCompleto` y los expone en `permutaAnio/permutaKm/permutaEstadoTxt`. El bloque `estado_calificacion` muestra ✅ con los valores concretos cuando están, no solo ❌ desconocido. Reduce re-preguntas del bot por datos ya dados.

## Known failure patterns

### Post-tool-call context drift (2026-04-09 — FIXED en test, pendiente prod)

**Síntoma**: el LLM entiende bien en run 0, llama un tool, y en run 1 (post-tool) genera una respuesta completamente distinta anclada en el tool output, ignorando su propia reasoning anterior.

**Mecanismo**: cuando el primer LLM call tiene `finish_reason: tool_calls`, LangChain descarta el content del run 0 (lo trata como "thought"), re-invoca el modelo con `[system, user, AIMessage(tool_call), ToolMessage(result)]`, y el run 1 genera desde cero sin "ver" el reasoning previo como output válido.

**Caso documentado**: exec 18255 en prod. Cliente respondió "187700" a "¿cuántos km tiene?". Run 0: *"anoté que tenés Ford Ka con 187.700 km"* (correcto) + tool_call a `buscar_inventario_autos`. Run 1: *"opciones hasta U$S 10.000"* (inventado, anclado en Chevrolet Tracker/Captiva del tool result).

**Fix Fase 1 aplicado en test 2026-04-09** (ver roadmap para detalles):
1. **F1.1** — `Construir Estado CRM`: `botEnMidPermuta` regex sobre `ultimoMsgBot` sostiene guardia permuta aunque `nombreEfectivo=false`. Atrapa el caso ANTES del AI Agent.
2. **F1.2** — System prompt: "sin excepción" → "EXCEPCIÓN PERMUTA". Elimina la contradicción con sección PERMUTA.
3. **F1.3** — `bloquear_busqueda` flag en CRM state + bloqueo condicional en systemMessage vía expresión n8n. Defensa en profundidad si F1.1/F1.2 fallan.

**Regresión validada**: cliente Tiago completo (nombre+permuta → km → estado → fotos → cierre) sin caer al AI Agent. Compra normal ("busco una hilux") sigue funcionando.

### Anticipo en pesos no parseado — Bug B/C Matias C3 (2026-04-10 — FIXED en test, pendiente prod)

**Síntoma**: Cliente entra por ML link de Citroën C3, bot muestra ficha con anticipo mínimo U$S 5.000. Cliente responde "Entregando 5.500.000, el resto de puede financiar?". Bot alucina alternativas 10× sobre el presupuesto (Ford Maverick U$S 38.500, Chevrolet Captiva U$S 11.500, Tracker U$S 13.000).

**Caso documentado**: prod execs 18921-18937, `results/bad-conv-20260410-v4-matias-debounce-anticipo.md`.

**Root cause chain**:
1. **Bug B** — `Inyectar Conversión Pesos` no matcheaba `"5.500.000"` (formato dot-separated sin prefijo `$`). Los patrones previos solo cubrían `$\s*N.NNN.NNN`, `N\s*millones`, `\d{7,}\s*pesos|ARS`. Sin conversión, el texto quedaba como-viene y el LLM lo interpretaba como USD ambiguos.
2. **Bug C** — `Construir Estado CRM` tenía lógica de `anticipo_insuficiente` solo para montos en USD. Aunque `Inyectar Conversión Pesos` hubiera detectado el monto, el gate no sabía convertir ARS→USD para comparar contra `minimoVehiculoFicha`.
3. **Parse de `U$S 5,000`** — `Parse Chain Output` hacía `parseFloat("5,000".replace('.','').replace(',','.'))` → `5.0`. Redis guardaba `{"m":5}` en vez de `5000`. Incluso si el resto funcionaba, la comparación `numUSD=3971 < 5` era false.

**Fix Fase 4 aplicado en test 2026-04-10**:

1. **B1** — `Inyectar Conversión Pesos`: agregado patrón 4 `(?<!U\$S\s)(?<!U\$S)(?<!USD\s)(?<!USD)(?<![\d.,])(\d{1,3}(?:\.\d{3}){2,})(?!\d)` — dot-separated ≥7 dígitos sin prefijo, con lookbehinds fixed-width split para excluir `U$S N`. Verificado: `"Entregando 5.500.000"` → detecta `5.500.000`; `"U$S 1.000.000"` → excluido.
2. **C1** — `Construir Estado CRM`: bloque `anticipo_insuficiente` reforzado. Triggers ampliados a `tengo|pongo|doy|pondría|puedo poner|entregando|entrego|entregaría|ofrezco|aporto|dispongo|cuento con`. Detecta monto, si `num >= 100_000 && _dolarBlue > 0` → convierte a USD: `numUSD = Math.round(num / _dolarBlue)`. Compara `numUSD >= 500 && numUSD < _minimoConocido` → dispara guardia + mensaje determinístico con derivación.
3. **C2** — `Parse Chain Output`: `parseFloat(raw.replace(/[.,]/g, ''))` en vez de `.replace(/\./g, '').replace(',', '.')`. Ahora tanto `"U$S 5,000"` como `"U$S 5.000"` parsean a `5000`. Aplicado a `anticipo_min_en_ficha`, `contado_en_ficha`, `permuta_en_ficha`.

**Validación (test_conversation.sh matias_c3)**:
```
>>> T1: "Hola, tengo algunas preguntas sobre Citroën C3 1.4 I Sx Am74. [ML link]"
<<< ficha C3 con anticipo U$S 5.000 + "¿Cómo te llamás?"
>>> T2: "Hola como estas? Esta disponible? Entregando 5.500.000, el resto de puede financiar?"
<<< "Tu anticipo de U$S 3.971 no alcanza para este vehículo (mínimo U$S 5.000), pero si querés te puedo poner en contacto con administración para armar un plan a medida."
```
9/9 checks pass. Antes: bot alucinaba alternativas 10× sobre presupuesto.

**Bugs A/E/F no cubiertos** (siguen como backlog):
- Bug A (O6 debounce race) — no hay fix
- Bug E (catalogo_ml fuerza pedir presupuesto con ML link + vehículo en stock) — no hay fix
- Bug F cosmético (`v:"¡Hola!"` en Redis ficha_enviada) — bajo impacto

### Permuta drift — Bug D Agustina Raptor (2026-04-10 — FIXED en test, pendiente prod)

**Síntoma**: Cliente entra con mensaje combinado "Tengo Ford Ranger Raptor 2024 10.800km perfecto estado + [ML link Ford Everest Active]". Bot muestra el Raptor (vehículo de permuta) como 3 opciones de compra del inventario (Ford Ranger Limited, Ford F150 Raptor, Ford Ranger Raptor 2.0) — ignora el Everest que el cliente pidió.

**Caso documentado**: prod execs 19128-19170, `results/bad-conv-20260410-v4-agustina-permuta-raptor.md`.

**Root cause**:
1. El mensaje contiene "Ford Ranger Raptor" → `buscar_inventario_autos` llamado con esa query → run 1 post-tool drift ancla la respuesta en los resultados de Ranger.
2. La regla F1.2 ("EXCEPCIÓN PERMUTA") del prompt era suave — el LLM la racionalizaba ("muestro estas opciones similares para que tengas idea...").
3. El `bloquear_busqueda` flag solo aplica cuando `entregaEfectiva && !vehiculoEfectivo`. Con ML link del Everest, `vehiculoEfectivo=true` → flag no se activa.

**Fix Fase 4 aplicado en test 2026-04-10**:

1. **D1** — `Construir Estado CRM`: extracción best-effort de `vehiculoPermuta` (regex `tengo (?:un|una)\s+X|para (?:vender|entregar|permutar)\s+X|tomarán como pago X|compr(?:an|arían)\s+X|ofrezco\s+X|entrego\s+X`) con limpieza post (corta en "+", "http", "casi nueva", etc.). Expuesto como `vehiculo_permuta` en el output del CRM.
2. **D2** — `AI Agent.systemMessage`: agregada expresión n8n que inyecta condicionalmente un bloque `⛔⛔⛔ REGLA ABSOLUTA — VEHÍCULO DE PERMUTA` cuando `vehiculo_permuta !== null`. El bloque ENUMERA explícitamente lo prohibido (NI principal, NI alternativa, NI "similar", NI "para comparar", NI "para que tengas en cuenta") y instruye: "Si `buscar_inventario_autos` devuelve resultados que contienen palabras del vehículo de permuta, DESCARTÁ esos resultados silenciosamente y mostrá SOLO el vehículo que el cliente PIDIÓ para comprar". Versión blanda previa fue racionalizada por el LLM, la versión con ⛔⛔⛔ + enumeración explícita funciona.
3. **D3** — Extracción y display de datos de permuta: `permutaAnio/permutaKm/permutaEstadoTxt` extraídos del `textoCompleto` con regex. `contexto_conversacional` y `estado_calificacion` muestran los valores concretos con ✅ en vez de `❌ desconocido`, para que el LLM no re-pregunte datos ya dados.

**Validación (test_conversation.sh agustina_raptor)**:
```
>>> T1: "Tengo Ford Ranger Raptor 2024 10.800km perfecto estado + [ML link Ford Everest]"
<<< "¡Hola! / Perfecto, te tomo la Ford Ranger Raptor 2024 [...]. ¿Podés c[ompartir fotos]?"
    NO muestra Ranger/Raptor como compra, NO pide año/km del Raptor
>>> T2: "Soy Agustina, ya te mando las fotos del Raptor"
<<< "Perfecto, ya le aviso a administración para que evalúen la permuta y se pongan en contacto con vos."
```
7/7 checks pass. Antes: bot mostraba 3 Raptors del inventario + pedía año/km ya dados.

### Sheets CRM pollution sticky (2026-04-09 — FIXED en test, pendiente prod)

**Síntoma**: una vez que Extraer Datos CRM alucinaba y escribía un valor incorrecto a Sheets (ej: `nombre="Focus"`, `presupuesto="187700"`), el valor persistía turnos enteros porque Actualizar Sheet CRM hace appendOrUpdate sticky — no borra campos cuando el LLM devuelve vacío.

**Caso documentado**: en exec 18279 el LLM escribió `nombre: "Focus"` (nombre del vehículo) y `presupuesto: "187700"` (km del vehículo a permutar). Desde ese turno hasta el final de la conversación, todas las respuestas del bot asumieron ese presupuesto inventado.

**Fix Fase 2 aplicado en test 2026-04-09**:
1. **F2.2** — `Extraer Datos CRM`: secciones PRESUPUESTO/NOMBRE reforzadas con prohibiciones explícitas + 4 EJEMPLOS ANTI-POLLUTION few-shot (incluye caso Tiago literal).
2. **F2.3** — `Parser JSON CRM`: downgrade guards determinísticos post-LLM. Nullify `nombre` si primera palabra matchea `modelosRegex`. Nullify `presupuesto` si el número aparece en `entrega` string.
3. **F2.1** — `Construir Estado CRM` + AI Agent systemMessage: `preguntaBotAnterior` detection (km/año/estado/fotos/nombre/presupuesto) + inyección condicional de `<TURNO_ACTUAL_CRITICO>` (context pinning XML al final del system prompt).

**Validación exec 21507**: mensaje combinado "Hola soy tiago, tengo un Ford ka 2013 viral 1.0 / 187700 / perfecto estado" → `nombre:null, presupuesto:null, entrega:{marca:"Ford",modelo:"Ka",anio:2013,km:187700,estado:"perfecto estado"}`. Antes (exec 18279): `nombre="Focus", presupuesto="187700"`. Ahora: limpio.

## Refactoring de consolidación (2026-04-06)

Reducción de 152 → 139 nodos manteniendo toda la lógica de negocio determinística.

| Fase | Cambio | Nodos |
|------|--------|-------|
| **Fase 1** | Switch Guardia + 6 handlers → `Handler Guardia` (Code) | 152→142 |
| **Fase 2** | 6 Edit Fields (por categoría) → `Construir Instrucción` (Code) | 142→137 |
| **Fase 3** | Consolidar post-alert pipeline → `Evaluar Alerta` (Code) + ajustes determinísticos en guardias, clasificador y post-processing | 137→139 |

Nodos consolidados clave:
- `Handler Guardia`: toda la lógica de presupuesto/permuta/pedido/noResponder/anticipo_derivación en 1 Code
- `Construir Instrucción`: Edit Fields5/6/7 + Cuotas + Compra → 1 Code con switch por categoría
- `Evaluar Alerta`: detectar alerta sinfotos + Detectar Confirmacion Contacto + Combinar Handoff → 1 Code

Principio: consolidar nodos, NO mover lógica crítica al LLM. Las guardias siguen en código.

## Deploy

```bash
bash scripts/deploy-workflow-test.sh trebol_v4_test.json chkkStDHenGFhwE7
docker restart trebol-test-n8n trebol-test-n8n-worker
bash scripts/clear-chat-memory.sh 5491150635028 test
```
