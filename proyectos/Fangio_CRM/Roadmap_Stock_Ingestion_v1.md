---
tags: [fangiocrm, roadmap, ingesta, xlsx, embeddings, multitenant, mongodb]
fecha: 2026-05-04
estado: DISEÑO APROBADO — pendiente implementación
autor: santi + claude
relacionado: [[Fangio_CRM]], [[Trebol_Bot_Embedded]], [[SheetsToMongo_RAG_Inventario]]
---

# Roadmap — Ingesta de Stock por Tenant (XLSX → MongoDB Vector Search)

Pipeline para que cada concesionaria (tenant) suba su inventario en XLSX dentro de FangioCRM, lo mapee a un schema canónico, lo sincronice incremental a su colección MongoDB privada y genere embeddings consultables por el bot.

> **Decisiones del usuario (2026-05-04)**:
> - **A)** Trebol Bot (LangGraph Python) vive embebido como motor de respuestas de FangioCRM. Sección configurable por tenant: nombre concesionaria, métodos de financiación, nombre del vendedor (bot), temperatura. Detalle en [[Trebol_Bot_Embedded]].
> - **B)** Aislamiento estricto: una **colección MongoDB por tenant** (`inventory_{tenantId}`). Stock por tenant, vector index por tenant.
> - **C)** Sync incremental con la lógica probada de [[SheetsToMongo_RAG_Inventario]] (INSERT/UPDATE/DELETE/SKIP) — pero sin AppScript, con fingerprint hash determinístico desde el worker (mejora descrita abajo).
> - **D)** Sin Paperclip por ahora. Todo dentro del repo `FangioCRM`.

---

## 0. Por qué este roadmap

Hoy el inventario del único tenant (`el-trebol`) se sincroniza desde Google Sheets vía un workflow n8n (`SheetsToMongo v2`). Esa lógica es buena pero:

- **No escala a SaaS** — cada nuevo tenant exigiría un Sheet propio + un workflow propio configurado a mano.
- **Requiere AppScript** — script frágil que genera ID en columna A cuando se escribe en "marca". Si lo borran o el tenant edita el Sheet por afuera, el sync se rompe (caso `propiedades` rota documentado en `SheetsToMongo_RAG_Inventario.md`).
- **Fricción de onboarding** — el cliente nuevo no quiere aprender Sheets, quiere arrastrar su Excel.

La nueva arquitectura mantiene la lógica incremental (su mayor virtud) pero la traslada a un pipeline **dentro de FangioCRM** que recibe XLSX, mapea, valida y sincroniza.

---

## 1. Arquitectura objetivo

```
                  ┌──────────────────────────────────────┐
                  │  FangioCRM Frontend (Next.js)        │
                  │  ┌────────────────────────────────┐  │
                  │  │ InventoryGrid + Upload XLSX    │  │
                  │  │ Mapping UI + Confirmación      │  │
                  │  └─────────────┬──────────────────┘  │
                  └────────────────┼──────────────────────┘
                                   │ (file upload)
                                   ▼
                  ┌──────────────────────────────────────┐
                  │  Plano de Ingesta (API Routes Next)  │
                  │  POST /api/inventory/upload          │
                  │   ├─ Parser XLSX (sheetjs)           │
                  │   ├─ Schema Detection (det. + LLM    │
                  │   │   fallback solo si confianza<X)  │
                  │   └─ Encola job en BullMQ            │
                  └────────────────┬─────────────────────┘
                                   │
                                   ▼
                  ┌──────────────────────────────────────┐
                  │  BullMQ Workers (Node, en VPS)       │
                  │   ├─ normalizer.worker               │
                  │   ├─ diff.worker                     │
                  │   ├─ classifier.worker (LLM clasif.) │
                  │   └─ embedder.worker (OpenAI)        │
                  └────────────────┬─────────────────────┘
                                   │
                                   ▼
                  ┌──────────────────────────────────────┐
                  │  Plano de Datos (MongoDB Atlas)      │
                  │   inventory_{tenantId}  (vector idx) │
                  │   inventory_audit_{tenantId}         │
                  │   tenant_schema_map                  │
                  └────────────────┬─────────────────────┘
                                   │
                                   ▼
                  ┌──────────────────────────────────────┐
                  │  Plano de Query (Trebol Bot Python)  │
                  │   Tool: structured_filter (Mongo)    │
                  │   Tool: semantic_search ($vector)    │
                  └──────────────────────────────────────┘
```

**No se agregan**: Qdrant, Pinecone, Paperclip. MongoDB Atlas Vector Search ya está en el stack y aguanta cientos de tenants × miles de autos sin problema. Si en algún momento llegamos a 50+ tenants × 100k+ autos, recién ahí evaluamos.

---

## 2. Schema canónico del inventario

Cada documento en `inventory_{tenantId}` tiene esta forma. Los campos están separados en **structured** (filtros exactos en Mongo) vs **semantic** (lo que se embebe).

```jsonc
{
  "_id": "<row_id>",                 // SHA-1(tenantId + business_key) — estable
  "tenant_id": "el-trebol",
  "content_hash": "<sha-1>",         // fingerprint del contenido normalizado
  "source": {
    "upload_id": "<uuid>",           // batch en el que entró
    "row_index": 42,                 // índice original en el XLSX
    "uploaded_at": "2026-05-04T..."
  },

  // STRUCTURED — todo esto va a filtros exactos
  "marca": "Toyota",
  "modelo": "Hilux SRX",
  "anio": 2020,
  "km": 85000,
  "precio_usd": 28500,
  "precio_ars": null,
  "patente": "AB123CD",              // opcional
  "chasis": "8AJ...",                // opcional
  "sku_dealer": "TR-1042",           // opcional, ID interno del dealer
  "tipo": "Vehiculo",                // Vehiculo | Moto | Camion | Maquinaria | Acuatico
  "estado": "disponible",            // disponible | señado | vendido | no_en_agencia

  // STRUCTURED — clasificación LLM (igual a propiedades-test)
  "carroceria": "pickup",
  "traccion": "4x4",
  "transmision": "automatica",
  "combustible": "diesel",
  "es_clasico": false,
  "es_deportivo": false,
  "segmento": "media-alta",
  "tags": ["familiar", "trabajo", "off-road"],

  // SEMANTIC — lo que se embebe
  "page_content": "Toyota Hilux SRX 2020. Pickup 4x4 diesel automática. 85.000 km. Único dueño, service oficial al día. Cuero, GPS, cámara de retroceso.",
  "embedding": [/* 1536 floats */],
  "embedding_model": "text-embedding-3-small",
  "embedding_version": "v1",         // bump si cambiamos el prompt de page_content

  // METADATA cruda original — por si falló el mapping y queremos auditar
  "raw_row": { "Marca": "Toyota", "Modelo": "Hilux SRX", ... }
}
```

**Por qué `_id` = SHA-1(tenant_id + business_key)**:
- Estable entre uploads (mismo auto = mismo `_id` aunque cambie de fila o de Excel).
- No depende de columna A con AppScript ni de patente (que puede no existir).
- `business_key` se elige con esta prioridad:
  1. `chasis` si existe (VIN — único globalmente).
  2. `sku_dealer` si existe (ID interno del concesionario).
  3. `patente` si existe.
  4. Hash de `marca|modelo|anio|km|precio_usd` (último recurso — colisiona si hay dos autos idénticos, pero es raro).

**Por qué `content_hash`**:
- Detección barata de cambios: comparás 1 string contra Mongo, no campo por campo.
- Si `content_hash` no cambió → SKIP, no toca embedding (ahorra tokens).
- Si cambió → UPDATE = delete + reinsert con embedding fresco (mismo patrón que SheetsToMongo).

---

## 3. Lógica de diff (mejora sobre SheetsToMongo)

Por cada upload XLSX:

```
1. Parsear XLSX → rows[]
2. Mapear cada row al schema canónico (con el mapping aprobado por el tenant)
3. Calcular row_id + content_hash de cada row → upload_set: { row_id → content_hash }
4. Cargar de Mongo: db_set: { row_id → content_hash } (proyección {_id:1, content_hash:1})
5. Diff:
     INSERTS = upload_set.keys - db_set.keys
     DELETES = db_set.keys - upload_set.keys
     UPDATES = intersección donde upload[id].hash != db[id].hash
     SKIPS   = intersección donde hashes coinciden
6. Encolar:
     - 1 job classifier+embedder por cada INSERT/UPDATE
     - 1 job delete por cada DELETE
     - SKIPS no generan jobs
7. Auditar todo en inventory_audit_{tenantId}
```

**Mejoras vs SheetsToMongo v2**:

| Aspecto | SheetsToMongo v2 | Stock Ingestion v1 |
|---|---|---|
| Fuente | Google Sheets + AppScript | XLSX upload directo |
| ID | Columna A escrita por AppScript | SHA-1 determinístico desde worker |
| Diff | Compara `pageContent` normalizado completo | Compara `content_hash` (1 string vs string) |
| Cuándo corre | Cron cada 4h | Trigger al subir + cron diario opcional |
| Aislamiento | 1 colección compartida | 1 colección por tenant |
| Estados raros | Hardcoded "señado", "no en agencia" | Campo `estado` explícito en schema |
| Audit trail | No | Sí, en `inventory_audit_{tenantId}` |
| Mapping de columnas | Hardcoded en Code node | UI configurable + persistido en `tenant_schema_map` |
| Re-embed si cambia prompt | Manual, full re-sync | Bump `embedding_version` → reembed selectivo |

**Soft delete vs hard delete**: por seguridad, los DELETE no borran el doc — actualizan `estado: "no_en_agencia"` y `embedding: null`. El bot ignora docs con `estado != "disponible"` en sus queries. Después de 30 días sin volver a aparecer en uploads, un job de housekeeping los borra de verdad. Esto evita perder historial si el cliente sube un XLSX incompleto por error.

---

## 4. UI del Mapping (en FangioCRM)

Pantalla nueva: **Inventario → Sincronizar XLSX**.

### Flujo del usuario

1. Cliente arrastra `inventario.xlsx` en el dropzone.
2. Backend parsea las primeras 50 filas y devuelve:
   - Headers detectados.
   - Sample de valores por columna.
   - **Auto-mapping sugerido** contra el schema canónico.
3. UI muestra una tabla:

   | Columna XLSX | Sample | Mapeada a | Confianza |
   |---|---|---|---|
   | "Marca" | Toyota, Ford... | `marca` ✅ | 100% |
   | "Modelo Detallado" | Hilux SRX 4x4 | `modelo` ⚠️ | 78% |
   | "Año" | 2020, 2018 | `anio` ✅ | 100% |
   | "Kilom." | 85000 | `km` ✅ | 95% |
   | "Observ." | "único dueño..." | `page_content` (extra) ⚠️ | 60% |

4. Cliente puede sobreescribir cada mapeo con un dropdown (o marcar "ignorar columna").
5. Botón "Confirmar y sincronizar".
6. Backend persiste el mapping en `tenant_schema_map` para que la próxima vez sea automático.
7. Backend encola el job de ingesta y muestra progreso en vivo (websocket o polling).

### Auto-mapping: deterministic-first

```
matchScore(headerXLSX, canonicalField):
  1. exact match (case-insensitive, sin espacios) → 1.0
  2. alias match contra diccionario por idioma →   0.95
     ej. "marca" ← {"marca","brand","fabricante","make"}
  3. fuzzy (levenshtein/jaro-winkler) > 0.8     → 0.7-0.9
  4. semantic match con embedding del header     → 0.5-0.85
  5. LLM fallback (gpt-4.1-nano) — solo si paso 1-4 < 0.6
```

LLM fallback recibe: lista de headers sin matchear + sample de 5 valores cada uno + lista de campos canónicos disponibles. Devuelve mapping JSON. Costo despreciable (1 llamada por upload, ~500 tokens).

### Persistencia del mapping

`tenant_schema_map`:
```jsonc
{
  "_id": "el-trebol",
  "version": 3,
  "mapping": {
    "Marca": "marca",
    "Modelo Detallado": "modelo",
    "Año": "anio",
    "Kilom.": "km",
    "Observ.": "page_content_extra"
  },
  "ignored_columns": ["Color interior", "Vendedor"],
  "updated_at": "2026-05-04T...",
  "approved_by": "user_id_xxx"
}
```

Al próximo upload, si los headers son los mismos, se aplica el mapping sin pedir confirmación. Si hay headers nuevos o faltantes, se vuelve a pedir aprobación.

---

## 5. Embeddings — qué se embebe y cuándo

**Texto embebido (`page_content`)** generado en el classifier worker:

```
{tipo} {marca} {modelo} {anio}. {carroceria} {traccion} {transmision} {combustible}.
{km} km. {observaciones_originales}.
Sinónimos: auto, coche, automóvil, vehículo. {tags_concatenados}.
```

Los **sinónimos por tipo** ya probados en SheetsToMongo (ver `SheetsToMongo_RAG_Inventario.md`) se mantienen — sin esto el RAG falla cuando el cliente dice "coche" y en el inventario dice "auto".

**Cuándo se reembede**:
- INSERT → siempre.
- UPDATE → siempre (delete + reinsert).
- SKIP → nunca.
- Bump de `embedding_version` (cambio de prompt o modelo) → job de reembed batch que recorre toda la colección.

**Modelo**: `text-embedding-3-small` (1536 dims) — barato, suficiente. Mismo que usa SheetsToMongo, el index de Atlas se reutiliza.

---

## 6. Aislamiento multi-tenant

### Colecciones MongoDB

Una por tenant: `inventory_{tenantId}`. Cada una con:
- Vector search index llamado `vector_index_v1` con definición:
  ```jsonc
  {
    "fields": [
      { "type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine" },
      { "type": "filter", "path": "estado" },
      { "type": "filter", "path": "tipo" },
      { "type": "filter", "path": "carroceria" },
      { "type": "filter", "path": "traccion" }
    ]
  }
  ```
- Indices estructurados: `{tenant_id:1}`, `{marca:1, modelo:1, anio:1}`, `{precio_usd:1}`, `{estado:1}`.

### Tradeoff vs colección compartida

Elegimos colección por tenant porque:
- ✅ Aislamiento físico (una query nunca puede leakear a otro tenant).
- ✅ Indexes optimizados por tenant (Hilux es popular en uno, Vespa en otro).
- ✅ Backups y restores granulares.
- ❌ Más overhead operacional cuando llegues a 200+ tenants (200 colecciones, 200 vector indexes).
- ❌ Queries cross-tenant (benchmarks, métricas globales) requieren agregaciones explícitas.

Cuando lleguemos a esa escala, evaluamos consolidar. Hoy no es problema.

### Bot lookup

El bot recibe `tenant_id` desde el contexto de la conversación (vía Evolution instance). Toda tool del bot recibe `tenant_id` y construye la query contra `inventory_{tenantId}`. Sin `tenant_id` → la tool tira error y el bot deriva a admin.

---

## 7. Servicios concretos a construir

### 7.1 En el repo `FangioCRM` (Next.js + Node workers)

| Pieza | Tipo | Responsabilidad |
|---|---|---|
| `POST /api/inventory/upload` | API Route | Recibir XLSX, parsear, retornar preview + auto-mapping |
| `POST /api/inventory/sync` | API Route | Confirmar mapping, encolar job en BullMQ |
| `GET /api/inventory/sync/:upload_id` | API Route | Consultar progreso del job |
| `GET /api/inventory/audit` | API Route | Listar últimos uploads, diffs aplicados |
| `workers/normalizer.ts` | BullMQ worker | Mapping XLSX → schema canónico, soft-validations |
| `workers/diff.ts` | BullMQ worker | Calcular INSERT/UPDATE/DELETE/SKIP |
| `workers/classifier.ts` | BullMQ worker | LLM clasifica los 8 campos (carroceria, etc.) |
| `workers/embedder.ts` | BullMQ worker | OpenAI embeddings + upsert a Mongo |
| `workers/reembed.ts` | BullMQ worker (manual) | Re-embeber colección al bumpear `embedding_version` |
| `lib/schemaDetection.ts` | Library | Auto-mapping deterministic + LLM fallback |
| `lib/canonicalSchema.ts` | Library | Definición del schema canónico, alias por idioma |
| `lib/inventoryDiff.ts` | Library | Diff puro, testeable sin Mongo |
| `models/InventoryItem.ts` | Mongoose | Schema con index hints |
| `models/TenantSchemaMap.ts` | Mongoose | Mapping persistido |
| `models/InventoryAudit.ts` | Mongoose | Audit trail por upload |
| `components/inventory/UploadXlsx.tsx` | React | Dropzone + preview |
| `components/inventory/MappingTable.tsx` | React | Tabla de mapeo confirmable |
| `components/inventory/SyncProgress.tsx` | React | Progress bar + log live |

### 7.2 En el repo `kairos-infrastructure`

| Pieza | Responsabilidad |
|---|---|
| `bot-service/trebol_bot/agent/tools.py` | Generalizar `buscar_inventario_autos` para que reciba `tenant_id` y arme la colección dinámicamente |
| `bot-service/configs/<tenant>.yaml` | Por cada tenant nuevo, su YAML de config (o cargarlo desde Mongo) |
| Docker compose | Si los workers de BullMQ no van en Vercel, levantarlos como servicio en el VPS. Decidir en sprint 0 |

---

## 8. Sprints — ejecución

> **Regla**: cada sprint cierra con tests verdes, doc actualizada en este archivo (sección Estado), y demo en test antes de pasar al siguiente.

### Sprint 0 — Fundaciones (1 semana)

- [ ] Decidir dónde corren los workers BullMQ:
  - Opción A: en Vercel functions (más simple, costo por invocación)
  - Opción B: container en VPS junto a FangioCRM (`fangiocrm-workers`)
  - **Recomendación**: B — Vercel functions tienen timeout de 60s, embedding de 500 autos lo supera.
- [ ] Crear cluster Mongo Atlas (si no está dedicado para FangioCRM ya).
- [ ] Aprovisionar Redis para BullMQ (¿reutilizar `fangiocrm-n8n-redis`? validar aislamiento).
- [ ] Diseño final del schema canónico → committear `lib/canonicalSchema.ts` con tests.
- [ ] Crear `tenant_schema_map` y `inventory_audit_{tenantId}` (collections base).

### Sprint 1 — Schema Detection + UI básica (1 semana)

- [ ] `lib/schemaDetection.ts` con tests unitarios (deterministic match + alias + fuzzy).
- [ ] LLM fallback con `gpt-4.1-nano` y prompt versionado.
- [ ] `POST /api/inventory/upload` que recibe XLSX y retorna preview + auto-mapping.
- [ ] `UploadXlsx.tsx` + `MappingTable.tsx` funcionando con XLSX dummy.
- [ ] Persistir mapping en `tenant_schema_map`.
- [ ] **Demo**: subir XLSX de Trébol y ver mapping correcto sin tocar nada.

### Sprint 2 — Diff Engine + Workers (1 semana)

- [ ] `lib/inventoryDiff.ts` puro y testeable (sin Mongo). 100% cobertura.
- [ ] BullMQ setup: queues `inventory:normalize`, `inventory:diff`, `inventory:classify`, `inventory:embed`.
- [ ] Workers correspondientes (versión sin LLM aún).
- [ ] `POST /api/inventory/sync` encola jobs.
- [ ] `GET /api/inventory/sync/:upload_id` muestra progreso.
- [ ] **Demo**: subir 2 XLSX seguidos, segundo solo procesa diffs.

### Sprint 3 — Classifier + Embedder (1 semana)

- [ ] `classifier.worker` reusa el prompt de `scripts/backfill_classify_inventario.py` (Trébol).
- [ ] `embedder.worker` con OpenAI `text-embedding-3-small` y batching (100 docs por call).
- [ ] Soft delete: marcar `estado: "no_en_agencia"` en vez de borrar.
- [ ] Crear vector search index `vector_index_v1` por tenant (script `scripts/create_tenant_vector_index.ts`).
- [ ] **Demo**: subir XLSX, ver autos clasificados y consultables por `$vectorSearch` en MongoDB Compass.

### Sprint 4 — Bot consume el inventario nuevo (1 semana)

- [ ] Generalizar tool `buscar_inventario_autos` en `bot-service/trebol_bot/agent/tools.py` para recibir `tenant_id` y armar la colección.
- [ ] Agregar tool `filtrar_inventario_estructurado` (queries Mongo exactas: marca + año + precio range).
- [ ] El AI Agent del bot decide cuál usar según la query del cliente.
- [ ] **Test golden**: regresión `bash scripts/test_bot.sh all` debe seguir 23/23.
- [ ] **Demo**: bot Trébol contestando con stock leído desde la colección nueva (paralelo al pipeline viejo, sin romperlo).

### Sprint 5 — UI de Audit + housekeeping (1 semana)

- [ ] Vista en FangioCRM: histórico de uploads, qué cambió, errores.
- [ ] Job cron diario: items con `estado: "no_en_agencia"` por más de 30 días → hard delete.
- [ ] Job cron diario: detectar drift entre `tenant_schema_map` y headers reales (alert si cambió).
- [ ] Métricas: `inventory_items_total{tenant_id}`, `inventory_sync_duration_seconds`, `inventory_embedding_cost_usd_total`.

### Sprint 6 — Cutover Trébol y deprecación SheetsToMongo (1 semana)

- [ ] Migrar el inventario actual de `RAGtrebol.propiedades-test` a `inventory_el-trebol` (script one-shot).
- [ ] Apuntar el bot Trébol test a la colección nueva.
- [ ] Correr en paralelo 1 semana, comparando respuestas.
- [ ] Si todo OK: deprecar `SheetsToMongo v2` (workflow `4atsII1pbYHYtOFVYzaVa`) — ya estaba apagado para PROD desde 2026-05-02.
- [ ] Documentar en `Trebol/SheetsToMongo_RAG_Inventario.md` el archivado.

### Sprint 7+ — Onboarding del segundo tenant

- [ ] Crear tenant nuevo desde la UI de FangioCRM.
- [ ] Subir XLSX de inventario.
- [ ] Conectar Evolution + bot.
- [ ] Validar aislamiento (queries del tenant 1 jamás ven datos del tenant 2).

---

## 9. Decisiones abiertas (necesitan input)

> Estas las marco para que santi confirme antes de Sprint 0.

| # | Pregunta | Opciones |
|---|---|---|
| D1 | ¿Workers BullMQ en Vercel o en VPS? | A) Vercel (simple, caro, timeout 60s) · **B) Contenedor en VPS (recomendado)** |
| D2 | ¿Redis para BullMQ — reutilizar `fangiocrm-n8n-redis` o levantar `fangiocrm-bullmq-redis` aparte? | A) Reutilizar (más simple) · B) Aparte (mejor aislamiento) |
| D3 | ¿El XLSX se guarda permanentemente para auditoría o se descarta tras procesar? | A) Guardar en S3/R2 90 días · B) Solo metadata, descartar archivo |
| D4 | ¿El bot vive en VPS apuntando a Mongo de FangioCRM, o se duplica el bot dentro del repo FangioCRM? | A) VPS apunta a Mongo de FangioCRM · B) Bot embebido en repo FangioCRM (ver [[Trebol_Bot_Embedded]]) |
| D5 | Schema canónico: ¿incluir `precio_ars` además de `precio_usd` desde el día 1? | A) Solo USD (Trébol opera así) · B) Ambos con conversión automática |
| D6 | ¿Soportar más formatos además de XLSX (CSV, Google Sheets vía OAuth)? | A) Solo XLSX MVP · B) XLSX + CSV · C) Todo desde el principio |

---

## 10. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Tenant sube XLSX con headers raros que el LLM mapea mal | Alta | Medio | UI obliga confirmación humana en primera subida; mapping persiste para subsiguientes |
| Re-embed masivo cuando bumpeamos prompt de `page_content` | Media | Costo $$ | Versionado de embedding + reembed selectivo solo si cambia el prompt |
| Vector index lento al crecer la colección | Baja a 10k docs | Alto | Atlas Vector Search escala bien; al pasar 100k por tenant, evaluar particionado |
| Worker se cuelga procesando un XLSX corrupto | Media | Bajo | Timeout por job (5 min) + retry con backoff + dead letter queue |
| Cliente borra columna crítica del XLSX y rompe el sync | Media | Alto | Validación pre-sync: si headers cambian vs último mapping aprobado, pedir re-confirmación |
| Aislamiento roto: tenant A ve stock de tenant B | Baja | **Crítico** | Tests de aislamiento en cada PR + middleware obligatorio que inyecta `tenant_id` en toda query |

---

## 11. Estado

- **2026-05-04**: documento creado. Pendiente decisiones D1-D6 antes de iniciar Sprint 0.

---

## Referencias

- [[SheetsToMongo_RAG_Inventario]] — pipeline actual de Trébol (lógica fuente)
- [[FangioBot_v2_Architecture]] — pipeline n8n actual de FangioCRM (a deprecar gradualmente)
- [[Trebol_Bot_Embedded]] — cómo se embebe Trebol Bot dentro de FangioCRM
- [[Arquitectura_SaaS_Multitenant]] — topología actual
- [[Pipeline_v4]] — referencia de bot Trébol producción
