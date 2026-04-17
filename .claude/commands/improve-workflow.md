---
description: Mejora un workflow existente. Recibe el nombre del archivo JSON y el problema a resolver.
allowed-tools: Task, Read, Write, Bash
---

# Improve Workflow

Input esperado: `[nombre-workflow] — [problema o "revisión general"]`

## Fase 1 — Lectura paralela
Lanzá en paralelo con Task tool:
1. Task: `cat workflows/[nombre-workflow].json`
2. Task: `cat .claude/docs/decisions/PLAN.md 2>/dev/null || echo "Sin plan activo"`

## Fase 2 — Análisis paralelo
1. @workflow-architect con el JSON y el problema reportado
2. @prompt-engineer si el problema involucra comportamiento del AI Agent

## Fase 3 — Review
1. @reviewer para validar los cambios propuestos

## Fase 4 — Reporte final
- Problema identificado: causa raíz
- Cambios propuestos: nodos afectados
- Cambios en prompt: secciones afectadas (si aplica)
- Tokens: antes → después (si aplica)
- Veredicto: ✅ / ❌ / ⚠️
- Próximo paso
