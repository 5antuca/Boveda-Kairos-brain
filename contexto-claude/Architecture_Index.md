# Kairos Infrastructure — Architecture Index

Este archivo es un índice. La documentación completa está dividida en:

- **[[VPS_Architecture]]** (`infra/VPS_Architecture.md`) — VPS, Docker, containers, networks, envs, monitoring, backups, cron, **RAM state + capacity planning (medido 2026-03-19)**
- **[[Trebol_Prod_Architecture]]** (`proyectos/Trebol/Trebol_Prod_Architecture.md`) — Workflows n8n PROD (Trebol22cuotas, 131 nodos), AI Agent, system prompt, clasificador, Redis debounce, CRM, alertas
- **[[Workflow_v4_Reference]]** (`proyectos/Trebol/Workflow_v4_Reference.md`) — Workflow TEST v4 (`chkkStDHenGFhwE7`, 149 nodos post Fase 5). Referencia técnica del pipeline de 3 LLM calls, sistema de guardias, context compression, detector de drift F3.1, test harness golden F3.2, y Fase 5 handoff duro (bot-off fix via Chatwoot API + Redis flag + early gate, 2026-04-13).
- **[[Testing_Harness]]** (`proyectos/Trebol/Testing_Harness.md`) — Golden set + harness `test_conversation.sh`.
- **[[System_Map]]** (`infra/System_Map.md`) — Mapa end-to-end del flujo de mensaje.
- **[[Roadmap]]** (`Kairos_Brain/Roadmap.md`) — Roadmap activo, todas las fases, bugs abiertos.

> **Source of truth**: desde 2026-04-13 toda la doc técnica vive en `Kairos_Brain/`. Los archivos de `.claude/context/` se migraron a la bóveda. Backup en branch `backup/pre-obsidian-migration`.

## Resumen del Sistema

Infraestructura para "Concesionaria Trebol" en un VPS único (Ubuntu 24.04, 16GB RAM, 4 CPUs).

**Stack:** Docker Compose → Traefik (SSL) → N8N (Queue Mode) + Chatwoot + Evolution API + PostgreSQL + Redis + MongoDB Atlas

**Flujo:**
1. Cliente escribe a WhatsApp
2. Evolution API (v2.3.7) → Chatwoot (v3.13.0) → Webhook
3. N8N (Trebol22cuotas, 131 nodos) → debounce Redis → clasificación → AI Agent GPT-4.1-mini
4. AI consulta MongoDB (inventario) y Google Sheets (CRM)
5. Respuesta multi-mensaje con fotos → Chatwoot → WhatsApp

**Workflows prod:** 7 (Trebol22cuotas, Tool Simulador Cuotas, SheetsToMongo v2, AlertasVendedores, SheetsToMongo v1, Error Handler, Cleanup Chat Histories)

**Workflows test (v4):** Trebol v4 Test (`chkkStDHenGFhwE7`, 149 nodos post Fase 5 handoff duro). Pipeline 3 LLM calls + guardias deterministicas + context compression + detector drift F3.1 + Redis bot_off flag.

**Entornos:** prod (`trebol.*.kairosaisolutions.com`) + test (`test-trebol.*.kairosaisolutions.com`)
