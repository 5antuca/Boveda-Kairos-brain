---
tags: [fangiocrm, checklist, ingesta, next-session]
fecha: 2026-05-05
estado: PENDIENTE — abrir esto al empezar próxima sesión
relacionado: [[Arquitectura_Datos]], [[Roadmap_Stock_Ingestion_v1]], [[project_inventory_pivot_2026_05_05]]
---

# Next Session Checklist — Ingesta de Stock vía FangioCRM

Sesión del 2026-05-05 cerró con plan aprobado y pivot al approach **FangioCRM-as-source**. Documentación completa en [[Arquitectura_Datos]]. Antes de codear nada, leer eso.

## A — Lo que TIENE QUE HACER EL USUARIO antes de la sesión próxima

### A.1 Mandar la `MONGODB_URI` del cluster `fangiocrm`

- Ir a **Vercel → Project Settings → Environment Variables**
- Buscar `MONGODB_URI`
- Copiar el valor
- **NO** pegarlo en el chat del repo. Opciones:
  - **A.1.a (preferido)** — pegarlo en `/root/kairos-infrastructure/bot-service/.env` con nombre **`FANGIOCRM_MONGODB_URI=mongodb+srv://...`** (NO sobreescribir la `MONGODB_URI` actual que apunta a `RAGtrebol`)
  - **A.1.b** — registrarlo en `Kairos_Brain/secrets/inventario.md` (gitignored) y avisar a Claude que está ahí
- Verificar que sea readable: `docker exec trebol-test-bot env | grep FANGIOCRM_MONGODB_URI`

### A.2 Cargar un XLSX de prueba en FangioCRM y darle SAVE

Snapshot 2026-05-05: `tenantinventories` tiene 0 docs. El usuario hizo drag de XLSX pero no le dio guardar (o no quedó persistido).

Pasos:
1. Abrir FangioCRM en Vercel (URL del deploy)
2. Login con la cuenta que usás (la del tenant Trébol — `tenantId` probablemente `eltrebollll` o similar)
3. Ir a sección Inventario
4. Drag XLSX con autos de prueba (no usar el de prod)
5. Verificar que la grilla se llenó correctamente. Si algunos datos fallaron a posicionarse, anotarlo.
6. **Click "Guardar"** (botón Save)
7. Confirmar en Mongo Atlas que `db.tenantinventories.findOne()` devuelve un doc
8. Anotar el `tenantId` de ese doc para esta sesión

### A.3 (opcional pero útil) — Anotar qué columnas detectó mal

`InventoryGrid.tsx` tiene heurística básica de detección de tipo de columna (`detectColType`). Si en el step A.2.5 vió que columnas se posicionaron mal o tipos mal detectados, anotar cuáles para tunear la heurística en sesión.

---

## B — Plan de ejecución de la próxima sesión

Una vez listos A.1 y A.2:

### B.1 Pre-flight (5 min)
```bash
# Verificar URI accesible
docker exec trebol-test-bot env | grep FANGIOCRM_MONGODB_URI

# Smoke test conexión al cluster fangiocrm
docker exec trebol-test-bot python -c "
from pymongo import MongoClient
import os
uri = os.environ['FANGIOCRM_MONGODB_URI']
c = MongoClient(uri)
print('DBs:', c.list_database_names())
print('Collections:', c['fangiocrm'].list_collection_names())
print('TenantInventories count:', c['fangiocrm']['tenantinventories'].count_documents({}))
print('Sample doc:', c['fangiocrm']['tenantinventories'].find_one({}, {'gridState.data': {'$slice': 5}}))
"
```

### B.2 Backup de `propiedades-test` (1 comando)
```bash
mkdir -p /root/kairos-infrastructure/backups
docker exec trebol-test-bot python -c "
from pymongo import MongoClient
import os, json
c = MongoClient(os.environ['MONGODB_URI'])
docs = list(c['RAGtrebol']['propiedades-test'].find({}, {'embedding': 0}))
with open('/tmp/propiedades-test-backup-2026-05-05.json', 'w') as f:
    json.dump(docs, f, default=str)
print(f'Backup: {len(docs)} docs')
"
docker cp trebol-test-bot:/tmp/propiedades-test-backup-2026-05-05.json /root/kairos-infrastructure/backups/
```

### B.3 Construir módulo `bot-service/trebol_bot/ingest/`

Estructura (subset mínimo para MVP, sin Sheets API):
```
bot-service/trebol_bot/ingest/
├── __init__.py
├── gridstate.py        # expande TenantInventory.gridState → list[dict] con headers como keys
├── header_mapping.py   # mapping fijo: "Marca"→MARCA, "Año"→ANIO, "Contado"→PRECIO_AL_CONTADO, etc.
├── classifier.py       # reusa prompt de scripts/backfill_classify_inventario.py (8 campos)
├── embedder.py         # build pageContent con sinónimos + OpenAI text-embedding-ada-002
├── mongo.py            # upsert a RAGtrebol.propiedades-test (shape MAYÚSCULAS — compat con tools.py)
└── fangiocrm_reader.py # cliente Mongo dedicado al cluster fangiocrm + read TenantInventory
```

### B.4 Endpoints en `bot-service/trebol_bot/webhook/inventory.py` (nuevo archivo)

- `POST /webhook/inventory-changed` — body `{tenantId}`, dispara reimport en background. Lo llama FangioCRM post-save.
- `POST /ingest/reimport-tenant` — body `{tenantId, dry_run?}`, invocación manual.

Registrar router en `main.py`.

### B.5 Vaciar `propiedades-test` y reimportar
```bash
# Vaciar (después del backup)
docker exec trebol-test-bot python -c "
from pymongo import MongoClient
import os
c = MongoClient(os.environ['MONGODB_URI'])
res = c['RAGtrebol']['propiedades-test'].delete_many({})
print(f'Deleted: {res.deleted_count}')
"

# Reimportar desde FangioCRM
curl -X POST http://localhost:8000/ingest/reimport-tenant \
  -H 'Content-Type: application/json' \
  -d '{"tenantId":"<TENANT_ID_DE_A.2>"}'
```

### B.6 Validación
```bash
# Regresión bot
bash scripts/test_bot.sh all   # debe seguir 23/23

# Test manual: query al bot test pidiendo un auto que esté en el sheet de ejemplo
docker exec trebol-test-bot curl -s -X POST http://localhost:8000/test/message \
  -H 'Content-Type: application/json' \
  -d '{"phone":"5491150635028","message":"tienen Toyota?"}'
```

### B.7 Trigger live (agregar a FangioCRM)

En `/root/apps/FangioCRM/src/app/api/inventory/route.ts`, después de `findOneAndUpdate`:

```ts
// Notificar al bot Python para reembed
try {
  const botUrl = process.env.TREBOL_BOT_URL || 'https://test-trebol.bot.kairosaisolutions.com';
  await fetch(`${botUrl}/webhook/inventory-changed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId }),
  });
} catch (e) {
  console.error('Failed to notify bot of inventory change:', e);
  // No bloquear la respuesta — el reconciler diario va a recoger esto
}
```

Commit + deploy a Vercel. Probar editando una celda → bot reembede automático.

---

## C — Decisiones que quedaron abiertas para resolver en sesión

1. **Schema en propiedades-test**: confirmado mantener MAYÚSCULAS (`MARCA`, `MODELO`, `ANIO`, `PRECIO_AL_CONTADO`, etc.) para no romper `tools.py`. **OK** — no preguntar.
2. **Embedding model**: confirmado `text-embedding-ada-002` (mismo que el bot). **OK** — no preguntar.
3. **Vector index**: confirmado reusar `vector_index` existente. **OK** — no preguntar.
4. **MV Autos**: comparte la colección `propiedades-test`, también pierde inventario durante el cutover. Usuario OK con eso.
5. **Multi-tenant real (`inventory_{tenantId}`)**: NO en esta fase. Seguimos con `propiedades-test` como única colección hasta que llegue el segundo tenant productivo.
6. **Cron de reconciliación**: NO en esta fase. El trigger live (B.7) y el endpoint manual (B.4) son suficientes para MVP.

## D — Recordatorios obligatorios

- Después de cualquier cambio en bot: rebuild + restart trebol-test-bot. Limpiar memoria de test: `bash scripts/clear-chat-memory.sh 5491150635028`
- Después de editar `Kairos_Brain/`: `bash scripts/sync-vault.sh` para pushear ambos repos
- Si el bot se rompe: rollback rápido = `mongorestore` del backup de B.2 + revertir env var

## Referencias

- [[Arquitectura_Datos]] — mapa completo de Mongo, modelos, deploy
- [[Roadmap_Stock_Ingestion_v1]] — roadmap original (con banner de PIVOT 2 arriba)
- `/root/.claude/projects/-root-kairos-infrastructure/memory/project_inventory_pivot_2026_05_05.md` — memoria del pivot
- `/root/.claude/projects/-root-kairos-infrastructure/memory/reference_fangiocrm_mongo.md` — cluster info
- `/root/.claude/projects/-root-kairos-infrastructure/memory/reference_fangiocrm_repo.md` — repo + Vercel info
