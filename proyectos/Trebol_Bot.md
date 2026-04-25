# Proyecto: Trebol Bot

Evolución del bot de ventas para El Trébol Automotores.

## Historia de Versiones

### v3 — Rediseño Completo (2026-03-03)
- Reducción de 131 a 50 nodos.
- Implementación de **Redis** para estado de conversación (TTL 24h).
- Clasificador contextual y unificación de lógica en Code nodes.
- Herramienta de simulador de cuotas corregida.

### v4 — Refactorización de Consolidación (2026-04-03)
- **Fase 1**: Unificación de guardias (Switch Guardia → 1 Code node).
- **Fase 2**: Consolidación de Edit Fields (Edit Fields fan-out → 1 Code node).
- **Fase 3**: Consolidación de post-alert pipeline y ajustes determinísticos.
- **Fase 4**: Corrección de "context drift" post-tool-call y guards anti-pollution.
- **Fase 5**: Implementación de "Bot Off" duro via Redis flag y short-circuit en el pipeline.

## Bugs Documentados y Corregidos (v4)
- **Drift de Presupuesto**: GPT-4.1-mini alucinaba presupuestos tras llamadas a herramientas. Corregido con `state-gated tools` y reglas de exclusión.
- **Conversión de Pesos**: Error al capturar IDs de MercadoLibre como montos. Corregido con limpieza de URLs pre-regex.
- **Priority Inversion (Rocío)**: Guardia de permuta interrumpiendo respuestas de financiación.

## Pendientes Críticos
- [ ] **Bug A**: Debounce race condition (O6). Mensajes perdidos durante el procesamiento.
- [ ] **Bug E**: `catalogo_ml` pidiendo presupuesto innecesariamente cuando el vehículo ya está matcheado.
- [ ] **Monitor de Drift**: Dashboard para visualizar eventos de `llm_drift_events`.

## Referencias
- [[Workflow_v4_Reference]]
- [[Testing_Harness]]
