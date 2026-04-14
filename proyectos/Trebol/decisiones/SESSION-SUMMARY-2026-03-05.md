# Session Summary — 2026-03-05 (actualizado)

## Qué es Trebol v3 Test

Workflow n8n de **68 nodos** para un bot de WhatsApp de una concesionaria de autos (El Trébol Automotores). Versión optimizada del workflow de producción `trebol22cuotas` (131 nodos). Entorno TEST.

**Stack:** n8n Queue Mode + Chatwoot + Evolution API + MongoDB Atlas (vector search inventario) + Google Sheets (CRM + pedidos) + Redis (debounce, lock, conv_state) + GPT-4.1-mini

**Archivos clave:**
- Workflow: `workflows/trebol_v3_test.json` (68 nodos, ID: `wynjYf9n43hLdZaB`)
- Plan activo: `.claude/docs/decisions/PLAN.md`
- AI Tester: `.claude/docs/decisions/AiTesterPlan.md` (approach híbrido, operativo)
- Test script: `scripts/run-tests.sh` (14 regression tests)
- Test fixtures: `tests/fixtures/tb-*.json` + `tests/fixtures/tm-*.json`
- Conversaciones referencia: `docs/ConverBuenas.md` (7) + `docs/ConverMalas.md` (7)
- Arquitectura: `.claude/context/newTREBOLarchitecture.md`
- Deploy script: `scripts/deploy-workflow-test.sh`

---

## Regression Suite — Estado actual: 12/14 PASS

| Test | Estado | Detalle |
|------|--------|---------|
| TB-01 | **FAIL** | AI no incluye precio en ficha (conflicto BREVEDAD vs FORMATO LISTA) + fixture max_messages:3 inviable con fotos |
| TB-02 | PASS | C6: pending message queue (6 nodos nuevos) |
| TB-03 | PASS | C1: "vendedor" → "administración" |
| TB-04 | PASS | |
| TB-05 | PASS | |
| TB-06 | PASS | |
| TB-07 | **FAIL** | AI omite paso 3 (ofrecer pedido en año específico). C8 v2 no funciona (keywords genéricas bloquean inyección) |
| TM-01 | PASS | |
| TM-02 | PASS | |
| TM-03 | PASS | C2: regla no-stock reforzada |
| TM-04 | PASS | |
| TM-05 | PASS | C4+C5: regla post-pedido |
| TM-06 | PASS | |
| TM-07 | PASS | |

**Progreso:** 9/14 → 12/14 → 13/14 → 12/14 (TB-01 regresionó)

---

## Cambios aplicados al workflow JSON (C1-C7)

| Cambio | Qué | Estado |
|--------|-----|--------|
| C1 | Clasificador Contextual: "vendedor" → "administración" (papeles) | ✅ Aplicado |
| C2 | AI Agent prompt: regla NO-STOCK reforzada (evaluar MARCA+MODELO de resultados vector search) | ✅ Aplicado |
| C3 | AI Agent prompt: regla AÑO ESPECÍFICO (3 pasos obligatorios) | ✅ Aplicado |
| C4 | AI Agent prompt: regla POST-PEDIDO prioridad máxima (presupuesto = dato pedido, no búsqueda) | ✅ Aplicado |
| C5 | Construir Instrucciones: [PROHIBIDO] buscar vehículos en modo pedido | ✅ Aplicado |
| C6 | Pending message queue: 6 nodos nuevos (Redis SET/GET/DEL Pending, If Pending, Build Payload, Re-trigger) | ✅ Aplicado |
| C7 | Preparar Pedido: `extraer.TEL` + Crear Pedido Sheet: mapping explícito defineBelow | ✅ Aplicado |

---

## Cambios PENDIENTES en PLAN.md (C8 v3 + C9)

### C8 v3 — Inyección incondicional de pedido en Parsear Respuesta (TB-07)

**Problema:** GPT-4.1-mini omite consistentemente el paso 3 de la regla AÑO ESPECÍFICO (ofrecer pedido). C8 v2 no funciona porque keywords genéricas ("avisar", "te aviso") en otro contexto hacen que `hasPedidoOffer = true` y el fallback no inyecta.

**Fix:** Reducir keywords de 7 a 2 (`anotar`, `lista de pedidos`) — solo una oferta COMPLETA las contiene. Si no las encuentra → inyecta siempre. Peor caso: duplicado (aceptable).

### C9 — Fix regresión ficha sin precio + fixture max_messages (TB-01)

**Problema:** Conflicto entre regla BREVEDAD ("máximo 3 líneas, 250 chars") y FORMATO LISTA (ficha completa = 4-5 líneas, >250 chars). El AI a veces prioriza brevedad y trunca la ficha.

**Fix:**
1. **Prompt**: BREVEDAD no aplica a fichas de vehículos. Fichas van SIEMPRE completas.
2. **Fixture**: `max_messages: 3` → `12` (cada foto es un mensaje separado en Chatwoot)

---

## Dónde queremos llegar

### Inmediato (próximo paso)
1. Reviewer aprueba C8 v3 + C9
2. Deployer ejecuta → deploy a test
3. Correr suite → **14/14 PASS**

### Corto plazo (esta semana)
4. Iterar hasta que el bot sea estable y responda de forma humana
5. Verificar sheet pedidos (teléfono, alerta a vendedores)

### Mediano plazo
6. **Deploy a producción** — requiere spec formal separada, blue-green con rollback plan
7. **RAG conversacional** (pipeline Chatwoot → embeddings → MongoDB) — después de estabilizar v3

---

## Reglas de trabajo (esta sesión)

- **SDD:** spec/plan en PLAN.md → reviewer valida → deployer ejecuta
- **Claude**: solo diagnostica y escribe planes. NO aplica cambios al JSON directamente.
- **n8n-expert agent**: para todo análisis de workflow
- **reviewer agent**: valida antes de ejecutar
- Post-deploy: `bash scripts/clear-chat-memory.sh 5491150635028 test`

---

## AI Tester — Operativo

Suite de 14 regression tests con approach híbrido:
1. Crear contacto + conversación REAL en Chatwoot TEST via API → conv_id numérico
2. POST al webhook n8n con conv_id real + sender.identifier único (Redis keys)
3. Esperar → leer respuestas via Chatwoot API → evaluar criterios
4. Cleanup: resolver conversación + limpiar Redis keys

**Variables:** `CHATWOOT_TEST_TOKEN`, `CHATWOOT_TEST_ACCOUNT_ID` (2), `CHATWOOT_TEST_INBOX_ID` (2)

---

## Credenciales y IDs

| Recurso | ID/Valor |
|---------|----------|
| Workflow test ID | `wynjYf9n43hLdZaB` |
| n8n test container | `trebol-test-n8n` |
| Redis test container | `trebol-test-redis` |
| Chatwoot TEST account_id | 2 |
| Chatwoot TEST inbox_id | 2 |
| Chatwoot PROD account_id | 4 |
| Redis prefix | `v3:` |
| Deploy script | `bash scripts/deploy-workflow-test.sh trebol_v3_test.json` |
| MongoDB credential | `LdUrhcJ7FxBoD4fF` |
| OpenAI credential | `U7Gr2AQALZbwD5qV` |
| Google Sheets credential | `fgnvAapxXc3HT6lR` |
| AlertasVendedores webhook | `$env.INTERNAL_WEBHOOK_URL/webhook/alertas-vendedores` |
| Nodos totales | 68 (61 original + 1 Enviar Alerta Pedido + 6 pending queue) |
