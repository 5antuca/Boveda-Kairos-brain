---
tags: [dashboard, moc, root]
---

# 🧠 Kairos Brain

Bienvenido al MOC (Map of Content) principal. Esta bóveda es la base de datos maestra (*Context Engineering*) de Kairos AI Solutions.

Cualquier LLM que opere bajo este usuario debe entender este archivo como la ruta hacia toda la memoria y contexto del desarrollador.

## 🗂️ Navegación Principal

- 👤 **Identidad y Configuración:** [[sobre-mi]] | [[Instrucciones Generales]] | [[Prompt_Maestro]]
- 🗺️ **Roadmap activo:** [[Roadmap]]
- 🧠 **Contexto para Claude (`contexto-claude/`):** [[Architecture_Index]] | [[Engineering_Manifesto]] | [[Rules_n8n]] | [[Preferencias_Arquitectura]] | [[Scripts_y_Herramientas]] | [[Comandos_Agentes_Skills]] (índice de `.claude/`) | [[Sincronizacion_Repos]] (regla dual-push)
- 🏗️ **Infra compartida (`infra/`):** [[VPS_Architecture]] | [[VPS_Stack]] | [[System_Map]] | [[n8n_Gotchas]] | [[Redis_Postgres_Debug]] | [[Chatwoot_Evolution_Quirks]] | [[Docker_Networking_Gotchas]]
- 🚀 **Proyectos Activos (`proyectos/`):**
  - [[LangGraph_Bot]] — **Migración bot Trébol a Python/LangGraph** (Fase 0 ✅ · Fase 1 en curso) · `proyectos/LangGraph_Bot/LangGraph_Bot.md`
  - [[Trebol]] — El Trébol Automotores (dashboard del proyecto en `proyectos/Trebol/Trebol.md`)
  - [[Fangio_CRM]] — CRM de Ventas automotor · Bot: [[FangioBot_v2_Architecture]] (diseño activo) · [[FangioBot_Blueprint]] (v1 descartada)
    - Workflows: [[Workflow_v4_Reference]] (test v4) · [[Trebol_Prod_Architecture]] (prod) · [[Pipeline_v4]] · [[SheetsToMongo_RAG_Inventario]]
    - Testing: [[Testing_Harness]]
    - Bugs: `proyectos/Trebol/bugs/`
    - Conversaciones: [[Malas]] · [[Buenas]]
    - Decisiones: `proyectos/Trebol/decisiones/` (planes históricos, session summaries)
    - Operaciones: `proyectos/Trebol/operaciones/` (playbooks de reset, feedback)
- 📥 **Inbox (`inbox/`):** captura rápida sin clasificar (volcado de memoria, postmortems sueltos, ideas crudas)

## 📊 Estado Actual
- **Foco:** Optimización del bot Trebol v4.
- **Transición:** Implementación de Estado Dinámico (Redis Data Flags) para resolver reinicios de estado en workflows de Whatsapp.
