---
tags: [archivado, historico]
fecha_archivado: 2026-05-01
---

# Docs archivados — Roadmap previo del bot multi-tenant

## Contenido

- **`Bot_LangGraph_Migration.md`** — spec del 27-abril para migrar el bot Trebol a multi-tenant FangioCRM, **basado en el bot v2 (Sales Swarm + Profiler + multi-LLM)**. Rollbackeado el 1-mayo. El rumbo multi-tenant sigue válido pero las premisas técnicas (Profiler, factory LLM, prompts con `{PSICOPERFIL_BLOQUE}`) ya no aplican al agente actual.

## Si querés rehacer el roadmap multi-tenant

El agente actual (post-rollback 1-mayo) está documentado en:
- [[../../LangGraph_Bot/Pipeline_Estructura]] — estructura técnica exacta.
- [[../../LangGraph_Bot/LangGraph_Bot]] — overview.

Cualquier roadmap nuevo de migración multi-tenant debería apoyarse en el pipeline actual, no en el v2 archivado.
