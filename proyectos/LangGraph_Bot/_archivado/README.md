---
tags: [archivado, historico]
fecha_archivado: 2026-05-01
motivo: rollback al bot del 18-abril como base de FangioCRM
---

# Docs archivados — Roadmap previo del bot LangGraph

> Estos docs **ya no aplican al agente actual**. Se conservan como referencia histórica del trayecto de iteración entre 17-abril y 1-mayo de 2026.

El 1-mayo-2026 se ejecutó un rollback del bot Trebol al estado del 18-abril (commit `7f1e5c2`) como base limpia para el agente de respuestas de FangioCRM. El roadmap previo (Sales Swarm, principios canónicos, multi-LLM, optimizaciones de tokens) NO se aplica al agente actual — quedó obsoleto en ese mismo rollback.

Branch operativa actual: `bot-rollback-2026-04-18` (en `kairos-infrastructure`).

## Contenido archivado

### Sales Swarm / Principios v1 y v2 (no implementados en el agente actual)
- `Bot_Behavior_Methodology.md` — metodología de 4 capas (principios + prompt + few-shot + eval suite). Diseñada para el bot v2.
- `Bot_Principios_Canonicos.md` — los 5 principios canónicos del 27-abril (constitución v1).
- `Bot_Principios_Iteracion_2026-05-01.md` — la iteración v2 (emojis incentivados + invitación a venir + cierre comercial). Aplicada el 1-mayo y rollbackeada en el mismo día.
- `Supreme_Sales_Swarm.md` — diseño del Swarm psicográfico (Profiler + 3 personas: EXPLORADOR/WORK_MACHINE/PASSION_DRIVE).

### Multi-LLM (no aplica — bot actual usa OpenAI directo)
- `LLM_Providers.md` — Groq, Gemini, OpenAI con factory.
- `OpenAI_Quota_Fallback.md` — alerta + bot-off ante 429 OpenAI.
- `Token_Optimization.md` — optimizaciones para reducir tokens 30K → 12-15K.

### Sesiones históricas (referencia de iteración)
- `Sesion_2026-04-17_Bugs_y_Observabilidad.md`
- `Sesion_2026-04-25_Sales_Swarm_y_LLM_Migration.md`

## Si querés recuperar algo

Estos archivos siguen en git history. Para volver a uno:

```bash
cd Kairos_Brain
git mv proyectos/LangGraph_Bot/_archivado/<archivo>.md proyectos/LangGraph_Bot/
```

O para consultarlos sin "desarchivarlos", abrilos directamente desde Obsidian — los wikilinks `[[..._archivado/Bot_Principios_Canonicos]]` siguen funcionando.
