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
| 2026-04-16 | Santi (presupuesto pesos) | Saludo duplicado en 2do turno + U$S 10k mal calculado (debería ser 7.143) + autos sobre techo mostrados igual | fix test 2026-04-16 | `results/bad-conv-20260416-v4-santi-presupuesto-pesos-saludo-duplicado.md` |
| 2026-04-16 | Santi (filtro RAG multi-turno) | postFilter solo activo en turno con monto; en turno "dale" no había CTX → RAG sin filtro → Onix 17.5k + Ka 16.8k + Sandero 18.2k para budget 7.1k | fix test 2026-04-16 | `results/bad-conv-20260416-v4-santi-filtro-rag-multiturn.md` |
| 2026-04-16 | guardiaUso T2 msg_count=0 | T1 guardia no guarda en n8n_chat_histories → T2 msg_count=0 → esPrimerMensaje=true → saludo duplicado "¡Hola!" | pendiente | `results/bad-conv-20260416-v4-guardia-uso-msg-count.md` |
| 2026-04-16 | postFilterPipeline + topK=8 → 0 resultados | topK=8 limita candidatos vectoriales antes de filter de precio; todos caros → filter elimina todo → "no tenemos opciones" incorrecto | fix bak25 (topK=30), fix definitivo pendiente | `results/bad-conv-20260416-v4-postfilter-topk-zero-results.md` |
| 2026-04-16 | Santiago (DS3 cuotas) — PROD | 4 bugs: sin Hola en primer turno ML link · calcular_cuotas sin precio_contado · "no stock" falso negativo RAG (re-query genérica) · llm_drift_events table missing en prod | fixes prompt + SQL prod (2026-04-16) | `results/bad-conv-20260416-v4-santiago-ds3-cuotas.md` |
| 2026-04-17 | DS3 anticipo loop | Anticipo insuficiente se repite 3 veces: (1) O6 doble ejecución en paralelo, (2) "ok dale" → AI regenera mismo mensaje en vez de confirmar handoff | fix test 2026-04-17 | `bugs/bad-conv-20260417-v4-ds3-anticipo-loop.md` |
| 2026-04-17 | C4 Picasso buffer×15 + RAG vacío | Webhook responseMode lastNode → Chatwoot reintenta 15 veces → buffer ×15 → AI llama buscar_inventario con {} → "no hay stock" falso + pregunta nombre después de darlo | fix webhook responseMode 2026-04-17 | `bugs/bad-conv-20260417-v4-c4picasso-buffer-rag.md` |

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
- Santi (ignora [CONTEXTO DE SISTEMA] de conversión ARS→USD, calcula con rate propio del training data)
- Santi (postFilter RAG solo activo en turno con monto; en turnos siguientes sin monto → sin filtro)

### RAG / Vector Search
- **postFilterPipeline + topK=8** — pool de candidatos demasiado pequeño, el filter de precio elimina todos → 0 resultados aunque existan autos baratos. Fix bak25: topK=30. Fix definitivo pendiente (Opción B Code node post-RAG).

### Side effects / integración Chatwoot
- **Jeep Compass (handoff blando)** — clase nueva, gap arquitectónico. Ver [[2026-04-12 Handoff Blando Jeep Compass]] con el postmortem completo.

### Debounce / race conditions
- **Bug O6** (Agustina, Matías) — mensajes durante processing se pierden. Backlog Fase 5+, no resuelto.

## Bugs abiertos (backlog)

- **O6 — Debounce race condition**: pending queue fuera del buffer. No trivial, requiere spec nueva.
- **Bug D — `msg_count=0` post-guardia**: T2 tras guardia activa tiene esPrimerMensaje=true → saludo duplicado. Investigar Guardia Save Chat timing vs Check Primer Mensaje.
- **Bug E — `catalogo_ml` fuerza pedir presupuesto con vehículo ya matcheado**: cuando el cliente entra con ML link, el precio ya es data efectiva. Ver roadmap.
- **Bug F (Agustina) — persistir `datos_parciales` entre turnos** para que keyword PERMUTA no resetee.
- **Rocío — priority inversion** guardia vs pregunta cliente: requiere lógica interrupt/resume.

## Links

- [[Pipeline_v4]] — arquitectura del workflow
- [[2026-04-12 Handoff Blando Jeep Compass|Postmortem Jeep Compass]]
- [[Buenas]] — conversaciones exitosas documentadas
- [[Trebol]] — overview del proyecto
