---
tags: [trebol, conversaciones, malas, postmortem, indice]
---

# Trebol v4 — Conversaciones Malas (Índice)

Cada entrada apunta al postmortem en `results/bad-conv-*.md` del repo principal. El postmortem contiene transcripción, diagnóstico, causa raíz y escenario de regresión.

| Fecha | Cliente / caso | Bugs principales | Fase que lo cubrió | Archivo repo |
|---|---|---|---|---|
| 2026-03-10 | Vento — anticipo/año | Parseo de anticipo + año confundido | pre-F1 | `results/bad-conv-20260310-v4-vento-anticipo-anio.md` |
| 2026-03-11 | Financiación repetida | Bot ofrece financiación dos veces en el mismo turno | pre-F1 | `results/bad-conv-20260311-v4-financiacion-repetida.md` |
| 2026-04-08 | Rocío (Up) | Km repetido, priority inversion permuta vs pregunta cliente | F1 (parcial) | `results/bad-conv-20260408-v4-rocio-up-km-repetido.md` |
| 2026-04-09 | Tiago | Drift post-tool-call + permuta guardia gap | F1 (root cause) | `results/bad-conv-20260409-v4-tiago-drift-permuta.md` |
| 2026-04-10 | Agustina (Ford Raptor) | PERMUTA keyword resetea state machine, debounce O6, guardia inversion | F4 (parcial, O6 pendiente) | `results/bad-conv-20260410-v4-agustina-permuta-raptor.md` |
| 2026-04-10 | Matías (Citroën C3) | Debounce O6, parseo pesos, anticipo insuficiente ARS, alucinación alternativas | F4 (B1/C1/C2/D2) | `results/bad-conv-20260410-v4-matias-debounce-anticipo.md` |
| 2026-04-12 | Jeep Compass (handoff blando) | Bot no se apaga post-handoff, re-envío ML reinicia ciclo | F5 handoff duro | `results/bad-conv-20260412-v4-jeep-compass-handoff-blando.md` |

## Clasificación por clase de bug

### Parseo / regex
- Vento (anticipo/año)
- Matías (pesos, anticipo ARS)

### State machine / guardias
- Rocío (priority inversion)
- Tiago (permuta guardia gap)
- Agustina (PERMUTA keyword reset)

### Drift del LLM
- Tiago (post-tool-call drift)
- Matías (alucinación alternativas sobre budget)
- Financiación repetida

### Side effects / integración Chatwoot
- **Jeep Compass (handoff blando)** — clase nueva, gap arquitectónico. Ver [[2026-04-12 Handoff Blando Jeep Compass]] con el postmortem completo.

### Debounce / race conditions
- **Bug O6** (Agustina, Matías) — mensajes durante processing se pierden. Backlog Fase 5+, no resuelto.

## Bugs abiertos (backlog)

- **O6 — Debounce race condition**: pending queue fuera del buffer. No trivial, requiere spec nueva.
- **Bug E — `catalogo_ml` fuerza pedir presupuesto con vehículo ya matcheado**: cuando el cliente entra con ML link, el precio ya es data efectiva. Ver roadmap.
- **Bug F (Agustina) — persistir `datos_parciales` entre turnos** para que keyword PERMUTA no resetee.
- **Rocío — priority inversion** guardia vs pregunta cliente: requiere lógica interrupt/resume.

## Links

- [[Pipeline_v4]] — arquitectura del workflow
- [[2026-04-12 Handoff Blando Jeep Compass|Postmortem Jeep Compass]]
- [[Buenas]] — conversaciones exitosas documentadas
- [[Trebol]] — overview del proyecto
