---
description: Cargar contexto completo de Trebol v3 antes de trabajar
---

# Prime — Trebol v3

## Run
ls workflows/ | grep v3
docker ps --format "table {{.Names}}\t{{.Status}}" | grep trebol-test
docker exec trebol-test-redis redis-cli -a 551ea4589d1f62e86de01e9d2d44f9af1f7c9bd252bcf945138082e79d8267dc --no-auth-warning KEYS "v3:*"

## Report
Resumí:
- Estado actual del workflow (75 nodos, workflow ID: wynjYf9n43hLdZaB, último deploy 2026-03-10)
- Fixes aplicados en 2026-03-10 (sesión 2):
  * catalogo_ml_financiacion: 1 vehículo (no 6), 12000 = anticipo (no presupuesto)
  * financiacion_opts_shown flag: previene repetición de opciones de financiación
  * last_anticipo_cliente en state: anticipo dicho en un mensaje se recuerda para ejecuciones posteriores
  * offering_financiacion_sim + esSimIntentOferc: detecta "dale simula con ese anticipo" y simula directamente
  * cuotas/financiacion_simular: usa last_anticipo_cliente como fallback si anticipo=0 en mensaje actual
  * Strip stray footer: "Valores orientativos" solo aparece en respuestas de financiacion_simular/cuotas
  * financiacion_pedir_anticipo HARDCODEADO en Parsear Respuesta (NO es auto_respuesta — si fuera auto_respuesta, saltea Extraer CRM y Estado y awaiting_anticipo nunca se setea → regresión TB-12)
- Fixes anteriores (sesión 1, 2026-03-10):
  * financiacion: state machine 3 pasos → opciones → pedir anticipo → simular o admin
  * Cuotas merge en 1 mensaje (Parsear Respuesta), fix regex afirmativo loose "si dale"
  * catalogo_ml: mensaje2 HARDCODEADO en Parsear Respuesta
  * Presupuesto: PROHIBIDO — system prompt + inyección en user message
  * spam/gestoría: esSpamComercial → admin inmediato
  * compra: rechaza lote/terreno como parte de pago
- Test suite: 37 tests (TB-01 a TB-17, TM-01 a TM-20)
  * Full suite: ~30 pass individualmente, 5-6 flakiness por n8n saturado
  * TB-17: ML link + financiacion + anticipo bundled → 1 vehículo, no presupuesto
  * TB-15/16: financiacion bundled/3-pasos → cuotas en 1 mensaje
- Redis keys activas para el número de test
- Referencia: prod workflow = trebol22cuotas_prod.json (131 nodos)
