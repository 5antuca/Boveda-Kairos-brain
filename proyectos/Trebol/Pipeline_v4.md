---
tags: [memoria, volcado, trebol, n8n, workflow, pipeline]
fecha_volcado: 2026-04-13
workflow_test_id: chkkStDHenGFhwE7
workflow_prod_id: wf4ts1WKcpOaE90A__FkD
---

# Trebol v4 — Pipeline volcado de memoria

Workflow principal del bot de [[Trebol|El Trébol]]. Test: `chkkStDHenGFhwE7` (149 nodos post bot-off fix), Prod: `wf4ts1WKcpOaE90A__FkD` (139 nodos, F1/F2/F3 y bot-off fix **aún no deployados a prod**).

Arquitectura determinística con IA inyectada. Ver [[Preferencias_Arquitectura#Principios]].

## Pipeline de alto nivel (3 LLM calls por mensaje)

```
Webhook Chatwoot
  ↓
Normalizar Payload (Code: extrae chat_id, bot_status, textoCompleto, phone_number)
  ↓
Edit Fields (normaliza phone, construye acount_id/converssation_ID — sí, con typos)
  ↓
[POST-FIX bot-off] Redis GET Bot Off Flag → IF Bot Off Flag
  ├── true  → SHORT-CIRCUIT (no response)
  └── false ↓
  ↓
Switch2 (lee $json.bot_status) → off/on
  ↓
Debounce (Redis LPUSH buffer → Wait 3s → LRANGE → "soy primero?" → lock processing)
  ↓
Clasificador Determinístico (Regex Code, 9 categorías)
  ↓
Construir Instrucción (Code switch por categoría)
  ↓
Check Primer Mensaje → Construir Estado CRM (Code, genera estado comprimido 1 línea)
  ↓
IF Guardia Activa
  ├── true  → Handler Guardia (Code) → Guardia Save Chat ───┐
  └── false → AI Agent (GPT-4.1-mini) → Basic LLM Chain ────┤
                                                             ↓
                                                       Parse Chain Output
                                                             ↓
                                          Evaluar Alerta → IF Ficha Mostrada
                                                             ↓
                                                       Redis SET ficha_enviada
                                                             ↓
                                          Code1/2/3 (split fotos) → HTTP send Evolution
                                                             ↓
                                          Extraer Datos CRM (post) → Sheets update
```

## Debounce detallado (Redis)

```
Webhook → Redis LPUSH {chat_id}:buffer (TTL implícito)
       → Wait 3s
       → Redis LRANGE {chat_id}:buffer
       → ¿soy el primer mensaje del batch? (IF)
           ├── SI → Redis SET {chat_id}:processing (lock 120s TTL) → flujo normal
           └── NO → descarta (otro worker ya procesando)
```

Propósito: agrupar 2+ mensajes consecutivos del cliente en 3s para procesarlos como un bloque. Evita responder a "Hola" antes de que llegue "tengo preguntas por el auto X".

## Clasificador (9 categorías regex-based)

| Categoría | Ruta |
|-----------|------|
| `comercial` | → Construir Instrucción → Check Primer Mensaje → AI Agent |
| `compra` | → idem |
| `cuotas` | → idem |
| `financiacion` | → idem |
| `catalogo_ml` | → Construir Instrucción → muestra ficha RAG MongoDB |
| `catalogo_ml_financiacion` | → combinada con info de cuotas |
| `permuta` | → activa guardia permuta |
| `fotos` | → activa handoff foto |
| `papeles` | → activa handoff papeles |

El clasificador es regex duro (~171 líneas). Si una categoría falla, se cae al fallback `comercial`.

## Guardias (State Machine Lite)

Las Guardias son Code nodes en n8n que controlan conversaciones estructuradas sin dejarlo al LLM:

- **Guardia permuta**: captura año, km, estado, fotos del auto del cliente secuencialmente. Si falta un dato, el bot pregunta el siguiente; si ya están todos → dispara handoff.
- **Guardia presupuesto / cuotas**: valida que haya anticipo válido antes de simular cuotas (evita que el LLM invente montos).
- **Guardia no-responder**: post-handoff / post-alerta, cortocircuito el pipeline. *Este era el gap del bug Jeep Compass — ver [[2026-04-12 Handoff Blando Jeep Compass]].*

## Context Compression (Construir Estado CRM)

En vez de pasarle al LLM todo el chat history (que lo hace alucinar), el Code node `Construir Estado CRM` comprime el estado detectado a una línea que se inyecta en el System Prompt. Ejemplo:
```
Estado: Nombre OK | Vehiculo: Jeep Compass (ML link) | Permuta: mid (faltan fotos) | Handoff: pendiente
```

Ventaja medida: **Postgres context de 6 → 3 turnos** sin perder info clave. Menos tokens, menos alucinación, mismo resultado.

## Fases deployadas (test, **prod pendiente**)

- **F1**: post-tool-call drift + permuta guardia gap
- **F2**: context pinning + anti-pollution CRM
- **F3**: drift detector (Postgres tabla `llm_drift_events` + script `apply_f3_drift_detector.py`)
- **F3.1**: 2 nodos adicionales del drift detector (141 nodos)
- **Bot-off fix (2026-04-13)**: handoff duro via Chatwoot API + Redis flag + gate. Ver [[2026-04-12 Handoff Blando Jeep Compass]]. **Deployado a test, no a prod**.

## Diferencias TEST vs PROD

- TEST: 149 nodos (con F1/F2/F3/F3.1 + bot-off fix)
- PROD: 139 nodos (F1/F2/F3 aún no migrados)
- TEST apunta a Chatwoot test y Evolution test; PROD a prod
- Debilidades pendientes prod: `O6` (observabilidad), `TM-05` (falta algo específico — buscar en roadmap.md)

## Fork MV Autos

- Workflow ID: `YdLoz4fjuGlMS1gn-2rU_` (solo test)
- Archivo: `workflows/mv_autos_test.json`
- Fork directo de trebol_v4_test con identidad MV Autos y onboarding cálido (pide nombre/presupuesto antes del RAG)
- Webhook Chatwoot: `/webhook/fd88e196-87b4-4851-9f9f-09a8a7a22d22`
- **Comparte toda la infra test** (Chatwoot, Evolution, Postgres, Redis, OpenAI, MongoDB)

## Workflows relacionados (no main)

| Workflow | ID | Función |
|---|---|---|
| Tool Simulador Cuotas | `nq3pdz31aX-61Wt17iyv6` | Sub-workflow cuotas 3/6/12 meses (factores hardcoded en Code, Sheet lookup deshabilitado) |
| SheetsToMongo v2 | `4atsII1pbYHYtOFVYzaVa` | Sync Sheets inventario → MongoDB con embeddings, cron 4x/día (`0 0 8,13,17,20 * * *`) |
| AlertasVendedores | `GyW7SjZluIdZyAYt_9LIO` (test) | Dispatcher de alertas a grupo WhatsApp |
| Error Handler | `u9skDIVyI2OnHieM` | Handler global |
| Cleanup Chat Histories | `RQp92tU6W7ZM9Wr5` | Limpieza Postgres |
| Metricas Chatbot | `2M74Du-5U7OFdpTTEKZTM` | Métricas |

## Links

- [[Trebol]]
- [[2026-04-12 Handoff Blando Jeep Compass]]
- [[n8n_Gotchas]]
- [[Redis_Postgres_Debug]]
- [[VPS_Stack]]
