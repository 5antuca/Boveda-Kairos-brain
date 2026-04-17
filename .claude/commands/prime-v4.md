---
description: Cargar contexto completo de Trebol v4 antes de trabajar
---

# Prime — Trebol v4

Workflows y containers:
!`ls workflows/ | grep -E "v4|mv_autos"`
!`docker ps --format "table {{.Names}}\t{{.Status}}" | grep trebol-test 2>/dev/null || echo "(containers no disponibles)"`

Redis keys activas:
!`docker exec trebol-test-redis redis-cli -a 551ea4589d1f62e86de01e9d2d44f9af1f7c9bd252bcf945138082e79d8267dc --no-auth-warning KEYS "v3:*" 2>/dev/null || echo "(redis no disponible)"`

MOC del vault Obsidian:
!`cat Bienvenido.md`

Pipeline v4 (resumen Obsidian):
!`cat proyectos/Trebol/Pipeline_v4.md`

Workflow v4 — referencia técnica completa:
!`cat proyectos/Trebol/Workflow_v4_Reference.md`

Otros workflows del cliente Trebol:
!`cat proyectos/Trebol/Trebol_Prod_Architecture.md`

Roadmap activo:
!`cat infra/Roadmap.md`

Conversaciones malas (índice postmortems):
!`cat proyectos/Trebol/conversaciones/Malas.md`

Conversaciones buenas (golden set):
!`cat proyectos/Trebol/conversaciones/Buenas.md`

Resumí el estado actual:
- Workflow v4 (ID: chkkStDHenGFhwE7, 149 nodos post Fase 5) y MV Autos (ID: YdLoz4fjuGlMS1gn-2rU_)
- PROD: trebol22cuotas_prod.json — READ ONLY (memoria `feedback_never_deploy_prod.md`)
- Test: 5491150635028 | Limpiar: `bash scripts/clear-chat-memory.sh 5491150635028 test`
- Foco actual: optimizar bot v4 en entorno test, smoke test pendiente Fase 5 handoff duro
- Diferencias TEST vs PROD y debilidades pendientes (O6, TM-05, Bug E, F)
- Roadmap Paperclip definido en CLAUDE.md (fases 0-5, NO ejecutar sin confirmación)
