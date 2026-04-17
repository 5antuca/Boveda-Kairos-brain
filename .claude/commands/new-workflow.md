---
description: Crea un workflow nuevo desde una descripción. Orquesta spec, arquitectura y prompt en paralelo.
allowed-tools: Task, Read, Write, Bash
---

# New Workflow

Creá un workflow de n8n completo desde la descripción del usuario.

## Fase 1 — Análisis paralelo
Lanzá en paralelo con Task tool:
1. @spec-analyst con el requerimiento completo del usuario
2. Task: `ls workflows/`

## Fase 2 — Diseño paralelo
Con la spec creada, lanzá en paralelo:
1. @workflow-architect con la ruta de la spec creada
2. @prompt-engineer con la ruta de la spec (si el workflow incluye AI Agent)

## Fase 3 — Review
1. @reviewer para validar spec + plan completo

## Fase 4 — Reporte final
- Spec creada: ruta del archivo
- Arquitectura propuesta: nodos principales
- System prompt: cambios o nuevo prompt
- Veredicto del reviewer: ✅ / ❌ / ⚠️
- Próximo paso: ¿listo para `/deploy` o hay blockers?
