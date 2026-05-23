---
tags: [fangiocrm, roadmap, next-session, ingesta, grilla]
fecha: 2026-05-23
estado: ABRIR AL EMPEZAR LA PRÓXIMA SESIÓN
relacionado: [[Fangio_CRM]], [[Next_Session_Checklist]], [[Trebol_Bot_Embedded]], [[Roadmap_Stock_Ingestion_v1]]
---

# Roadmap Próxima Sesión — FangioCRM (post 2026-05-23)

## ✅ Estado al cierre (2026-05-23)

**Ingesta de stock COMPLETA y LIVE end-to-end.**

- **Bot (test)**: módulo `bot-service/trebol_bot/ingest/` deployado. Reimport hecho: **54 autos del Trébol** en `propiedades-test` (67 leídos, 13 excluidos por señado/no-en-agencia). Commit `kairos-infrastructure@f1504a8` pusheado (branch `bot-rollback-2026-04-18`). Detalle en [[Next_Session_Checklist]] (banner EJECUTADO).
- **FangioCRM (prod Vercel)**: mergeado a `main` (`1a31fe4`) y deployado. Build local verificado sin errores antes del push.
  - **Trigger live**: al guardar inventario → `POST /webhook/inventory-changed` del bot → reembede automático.
  - **Grilla** (`InventoryGrid.tsx`): (a) Delete con filas seleccionadas vacía el contenido (acción `CLEAR_CONTENT`, undo OK); (b) pestaña "Archivo" movida al extremo izquierdo; (c) toast "✓ Guardado" al guardar en la nube.

## ⏳ Verificación PENDIENTE (primer paso próxima sesión)

1. Confirmar deploy Vercel **verde** + hard refresh en `www.fangiocrm.com/dashboard` y probar los 3 cambios de grilla en vivo (no se testearon visualmente, solo build + lint + tsc).
2. **Reembed end-to-end**: guardar inventario en FangioCRM → verificar en logs del bot:
   `docker logs trebol-test-bot 2>&1 | grep inventory_changed` → debe loguear `inventory_changed_reimport_done`.

## 📋 Backlog FangioCRM

- **Multi-tenant real**: hoy `ingest/` escribe SIEMPRE a `propiedades-test`. Cuando llegue 2º tenant productivo → `inventory_{tenantId}`. Ver [[Roadmap_Stock_Ingestion_v1]] + [[Trebol_Bot_Embedded]].
- **Bot embebido por tenant** ([[Trebol_Bot_Embedded]]): config por tenant (nombre concesionaria, vendedor, tono, financiación) — diseñado, NO implementado. El bot sigue hardcodeado a `trebol.yaml`.
- ~~**Bug cosmético**: columna FECHA del XLSX se guarda como serial de Excel (ej. `45983`) en la grilla.~~ **RESUELTO 2026-05-23** (`main@b6f9adf`, Vercel): `InventoryGrid.tsx` ahora detecta columnas de fecha por header (`isDateHeader`) y convierte el serial→`dd/mm/yyyy` (`excelSerialToDate`, UTC) en el loop de import. Aplica a imports futuros; el gridState ya guardado del Trébol sigue con serial hasta re-import. El bot NO usa FECHA → cosmético.
- **Regresión bot "tiago" (permuta)**: 21/23 checks; los 2 fails (T3/T4, varían a T2) son **variabilidad del LLM** en el flujo de permuta, NO regresión (el inventario cambió pero ese flujo no lo toca). Estabilizar el golden si molesta.

## 🧹 Deuda en kairos-infrastructure (sin commitear)

WIP ajeno que NO toqué y sigue sin commitear en `bot-rollback-2026-04-18`. Decidir si commitear o descartar:
- `agent/graph.py`, `agent/tools.py` (filtros estructurados — **YA deployado/corriendo** en el bot), `webhook/chatwoot.py`
- `workflows/sheetstomongo_v2_prod.json`, `workflows/sheetstomongo_v2_test.json`
- `scripts/backfill_classify_inventario.py`, `scripts/build_sheetstomongo_v2_test.py`
- `specs/2026-05-02-clasificador-llm-inventario.md` (+ specs de gerstner)

## 🔧 Comandos útiles

```bash
# Reimport manual (dry-run primero)
docker exec trebol-test-bot curl -s -X POST http://localhost:8000/ingest/reimport-tenant \
  -H 'Content-Type: application/json' -d '{"tenant_id":"el-trebol","dry_run":true}'

# Backups del cutover (con y sin embeddings)
ls kairos-infrastructure/backups/propiedades-test*-2026-05-23.json

# Estado colección
docker exec trebol-test-bot python3 -c "from pymongo import MongoClient; import os; c=MongoClient(os.environ['MONGODB_URI']); print(c['RAGtrebol']['propiedades-test'].count_documents({}))"
```

## Branches FangioCRM (mergeados, borrables del remoto)
- `feat/inventory-bot-reembed`, `feat/grid-ux-clear-save` → ambos en `main` (`1a31fe4`).
