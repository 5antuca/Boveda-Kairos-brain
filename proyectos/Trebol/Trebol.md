---
tags: [proyecto, activa, vps, bot, whatsapp, moc]
cliente: El Trébol Automotores
status: En Operación (Test y Prod)
---

# 🚗 Trebol — El Trébol Automotores

Plataforma integral de automatización para concesionarias en Argentina, desarrollada bajo **Kairos AI Solutions**. Cualifica leads, ofrece inventario automatizado y agenda contactos comerciales (Handoffs) por WhatsApp.

> **Foco actual**: optimizar el bot **Trebol v4** en TEST. Prod corre estable en `Trebol22cuotas` (131 nodos).

---

## 🗂️ Índice del proyecto

### Workflows
- [[Workflow_v4_Reference]] — Workflow TEST v4 (`chkkStDHenGFhwE7`, 149 nodos post Fase 5). Pipeline 3 LLM calls, guardias deterministicas, context compression, drift detector F3.1, handoff duro Fase 5
- [[Trebol_Prod_Architecture]] — Workflow PROD `Trebol22cuotas` (131 nodos), AI Agent, system prompt, clasificador, Redis debounce, CRM, alertas
- [[Pipeline_v4]] — Resumen visual del pipeline v4 (3 LLM calls + guardias)
- [[SheetsToMongo_RAG_Inventario]] — Sync Sheets→MongoDB con embeddings para el RAG de inventario

### Testing
- [[Testing_Harness]] — Golden set + harness `test_conversation.sh`

### Bugs y conversaciones
- **Bugs**: `bugs/` — postmortems técnicos
  - [[2026-04-12 Handoff Blando Jeep Compass]]
- **Conversaciones**: [[Malas]] (índice postmortems) · [[Buenas]] (golden set de regresión)

---

## 🛠️ Stack Tecnológico
- **Cloud/Infra**: VPS Hetzner (Ubuntu 24.04), Traefik (Gateway/SSL)
- **Control Plane**: n8n Queue Mode (Main + Worker + Redis). Workflows de hasta 149 nodos
- **Comunicaciones**: Evolution API (WhatsApp), Chatwoot (Web CRM + Sidekiq)
- **Data & State**: PostgreSQL (pgvector), Redis (debounce, locks, sesiones), MongoDB Atlas (Vector Search RAG inventario), Google Sheets (CRM + inventario origen)
- **Observabilidad**: Loki, Promtail, Grafana, Prometheus, Uptime Kuma, AlertManager

## 🧠 Arquitectura de la IA (Trebol v4)

Filosofía: **determinístico con inyección de IA**, NO IA autónoma descontrolada.

1. **Clasificador Duro** — 171 líneas de regex clasifican intents (comercial, compra, cuotas, financiacion, catalogo_ml, papeles, no_responder, etc.)
2. **State Machine Lite (Guardias)** — Code nodes en n8n controlan guardias deterministicas (`presupuesto_faltante`, `permuta_faltante`, `anticipo_insuficiente`, `bot_off`). Si dispara una guardia, el LLM no se llama; sale un mensaje fijo.
3. **Context Compression** — En vez de pasarle el historial completo al LLM, se comprime el estado detectado (`Nombre OK, Km de permuta Faltante, Presupuesto OK`) en una línea inyectada en el system prompt. Reduce tokens preservando la info clave (Postgres Context: 6 → 3).

## 🔗 Contexto compartido (otras carpetas del vault)
- [[Instrucciones Generales]] — reglas de trabajo para la IA
- [[Preferencias_Arquitectura]] — cómo trabaja Santi
- [[VPS_Stack]] · [[VPS_Architecture]] · [[System_Map]] — infra del VPS
- [[n8n_Gotchas]] · [[Redis_Postgres_Debug]] · [[Chatwoot_Evolution_Quirks]]
- [[Scripts_y_Herramientas]] — inventario de scripts del repo
- [[Roadmap]] — fases activas (F1/F2/F3/F5), bugs abiertos, deploy a prod pendiente

## 🚦 Estado actual

### Bot Python (LangGraph) — `trebol-test-bot`
- **Fase 6** — ✅ Deployada. Chatwoot test webhook apunta al bot Python. Langfuse observabilidad activa.
- **Fase 7** — ⏳ Código listo, pendiente `docker compose build` para activar CRM state injection.
  - Ver [[SESSION-SUMMARY-2026-04-17]] para detalle completo y comandos de rebuild.
- Regresión: `scripts/test_bot.sh` — 23/23 checks pasan

### Bot n8n (Trebol v4)
- **Fase 5 handoff duro** — implementada en TEST, pendiente smoke test (Jeep Compass scenario en 5491150635028)
- **Bugs O6 / Bug B / Bug E** — abiertos, ver [[Roadmap]]
- **Deploy a prod F1+F2+F3+F5** — bloqueado hasta validar smoke test
