---
tags: [trebol, conversaciones, buenas, golden, indice]
---

# Trebol v4 — Conversaciones Buenas (Golden / Regresión)

Lista de escenarios conversacionales que **pasan** el pipeline v4 y sirven como baseline de no-regresión. Sincronizado con `scripts/test_conversation.sh`.

## Golden set (harness F3.2)

Corrida con `bash scripts/test_conversation.sh [escenario|all]`. 38/38 PASS al cierre de Fase 4 (2026-04-10).

| Escenario | Descripción | Cubre bugs de | Comando |
|---|---|---|---|
| `tiago` | Flujo permuta completo con año/km/estado/fotos → handoff limpio | Tiago drift F1 | `bash scripts/test_conversation.sh tiago` |
| `tiago_full` | Tiago + cuotas y confirmación de pedido | F1 + F2 | `bash scripts/test_conversation.sh tiago_full` |
| `rocio` | Cliente Up con guardia permuta + pregunta financiación | Rocío priority inversion (parcial) | `bash scripts/test_conversation.sh rocio` |
| `hilux` | Cliente directo con ML link Hilux + matching | catálogo ML determinístico | `bash scripts/test_conversation.sh hilux` |
| `matias_c3` | Citroën C3 + anticipo en pesos | F4 B1/C1/C2 | `bash scripts/test_conversation.sh matias_c3` |
| `agustina_raptor` | Ford Raptor permuta + ML Everest | F4 D1/D2 vehiculoPermuta | `bash scripts/test_conversation.sh agustina_raptor` |
| `all` | Corre los 6 anteriores | — | `bash scripts/test_conversation.sh all` |

## Escenarios pendientes de agregar

### Jeep Compass (Fase 5 — regresión handoff duro)

Pendiente de implementar helper `assert_no_response` en `scripts/test_conversation.sh`. Turnos esperados:

| Turno | Input | Esperado | Assertion |
|---|---|---|---|
| T1 | "Hola, preguntas sobre Jeep Compass [ML link]" | ficha Jeep + pregunta nombre | response contains "Jeep Compass" |
| T2 | "Permuta, tengo un Nissan Note" | guardia permuta: pregunta año | response contains "año" |
| T3 | "2017 11700 km" | guardia permuta: pregunta estado | response contains "estado" |
| T4 | "Único dueño sin choques" | guardia permuta: pide fotos | response contains "fotos" |
| T5 | "Patentes al día" | handoff + alerta vendedor + `Redis SET bot_off` + Chatwoot `bot=off` | Redis key exists + Chatwoot custom_attributes |
| T6 | "Sin apuro" | **SILENCIO** | `assert_no_response` |
| T7 | re-envía link ML Jeep | **SILENCIO** | `assert_no_response` |

Ver [[2026-04-12 Handoff Blando Jeep Compass]] para diseño completo del test.

## Criterios de "buena conversación"

Para que una conversación cuente como buena (y se agregue al golden set) tiene que:

1. **Bot no inventa montos** — cuotas, anticipos, totales siempre vienen de datos reales (ficha Mongo o `Fetch Dólar Blue`)
2. **Guardias respetan el estado** — si el cliente dio año/km, el bot no vuelve a preguntarlo
3. **Handoff duro funciona** — post alerta, el bot se apaga vía Chatwoot API + Redis flag + gate
4. **Clasificador atina la categoría** — ML link → `catalogo_ml`, "cuánto", "cuotas" → `cuotas`, etc.
5. **Context compression limpia** — el LLM recibe estado comprimido, no historial crudo
6. **No drift post-tool-call** — después de `buscar_inventario_autos` el bot mantiene el foco en el vehículo matcheado

## Links

- [[Malas]] — índice de bad conversations
- [[Pipeline_v4]] — arquitectura del workflow
- [[Scripts_y_Herramientas#test_conversation.sh|test_conversation.sh]]
- [[Trebol]] — overview del proyecto
