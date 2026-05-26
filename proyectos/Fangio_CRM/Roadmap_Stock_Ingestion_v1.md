---
tags: [fangiocrm, roadmap, ingesta, embeddings, multitenant, mongodb]
fecha: 2026-05-05
estado: PIVOT 2 — pendiente URI Mongo de FangioBot para arrancar
autor: santi + claude
relacionado: [[FangioBot]], [[Arquitectura_Datos]], [[Trebol_Bot_Embedded]], [[SheetsToMongo_RAG_Inventario]]
---

# Roadmap — Ingesta de Stock por Tenant (FangioBot UI → MongoDB Vector Search)

> **PIVOT 2 (2026-05-05, post-investigación del repo FangioBot)**: el approach Apps Script descrito abajo está **OBSOLETO**. El descubrimiento clave: FangioBot ya tiene UI funcional de drag-XLSX → grid editable → persistencia en `TenantInventory.gridState` (cluster Mongo `fangiocrm`). No hace falta Apps Script ni Sheets API ni service account de Google.
>
> **Plan vigente**: FangioBot es la fuente de verdad del inventario. Bot Python lee `TenantInventory` del cluster `fangiocrm`, expande `gridState` a docs, normaliza headers, clasifica 8 campos LLM, embede, escribe a `RAGtrebol.propiedades-test`. Trigger live: agregar 3 líneas en `FangioBot/src/app/api/inventory/route.ts` que llamen webhook al bot post-save.
>
> Detalle de la arquitectura nueva en [[Arquitectura_Datos]]. Lo que sigue debajo es el approach Apps Script que se descartó — se mantiene como referencia histórica hasta que reescribamos el roadmap completo en próxima sesión.

Pipeline para que cada concesionaria (tenant) tenga su inventario en un Google Sheet propio y los cambios fluyan **en vivo** al RAG vía Apps Script onEdit instalable. Onboarding sin programadores: el cliente arrastra su XLSX en FangioBot y el sistema convierte el archivo en un Sheet con trigger ya instalado.

> **Decisiones del usuario (2026-05-05)**:
> - **A)** Fuente de cambios = **Google Sheets + Apps Script onEdit instalable** (vivo) en lugar de XLSX upload manual. Reconciliación cron diaria como red de seguridad.
> - **B)** Backend de ingesta = **módulo nuevo dentro de `bot-service`** (`bot-service/trebol_bot/ingest/`) + endpoint `webhook/sheets.py`. Separación de código sin separación de infra. Si la ingesta empieza a competir con el bot por CPU, escalar a servicio aparte (`inventory-sync-service`).
> - **C)** Onboarding MVP = **Ruta 3 (drag XLSX → Sheet creado por FangioBot en su propio Drive con Apps Script ya instalado)**. Upgrade futuro = Ruta 2 (OAuth del cliente + Drive watch sobre su propio sheet). Detalle en sección 4.
> - **D)** Aislamiento estricto: una **colección MongoDB por tenant** (`inventory_{tenantId}`). Stock por tenant, vector index por tenant.
> - **E)** Schema canónico, clasificador LLM (8 campos: carroceria, traccion, transmision, combustible, es_clasico, es_deportivo, segmento, tags), modelo de embeddings (`text-embedding-3-small`) y page_content con sinónimos = **igual al pipeline actual de Trébol** (ver [[SheetsToMongo_RAG_Inventario]]).
> - **F)** Sin Paperclip por ahora. Lógica de ingesta en `bot-service`. UI de onboarding/mapping en repo `FangioBot`.

---

## 0. Por qué este pivot

El roadmap previo (XLSX upload manual + workers BullMQ en Node) se descartó por dos razones:

1. **No era live.** El cliente tenía que subir el XLSX cada vez que cambiaba un precio. En la práctica, el inventario se actualiza desde un Google Sheet o ERP externo; pedirle al cliente que exporte y suba es fricción que no va a sostener.
2. **Duplicaba stack.** Workers BullMQ en Node implican reescribir el clasificador LLM y el embedder que ya existen en Python (`scripts/backfill_classify_inventario.py`).

Esta versión mantiene **todo el conocimiento ganado** con el pipeline actual de Trébol — schema canónico, clasificador, sinónimos en page_content, vector index — pero cambia la **fuente del cambio** (Sheet con trigger en vivo) y el **lugar donde corre la lógica** (Python en `bot-service`).

### El obstáculo real con triggers en Sheets

`onEdit` simple **no se dispara con cambios via API** — solo con edición humana en el navegador ([Google Groups, hilo conocido](https://groups.google.com/g/google-apps-script-community/c/B6gYy_VEvB0)). Eso elimina polling desde Python como opción primaria. La solución correcta es **`onEdit` instalable** (installable trigger): se autoriza por usuario propietario del script, corre con privilegios full y dispara con cualquier edición humana. Para los cambios via API que el trigger no captura (ej. integración ERP del cliente que mete cambios masivos), tenemos un **cron de reconciliación diario** (sección 9) que lee el sheet completo y reconcilia el diff.

### El obstáculo real con normalización de columnas

LLMs son muy buenos en schema mapping porque entienden similitudes semánticas que con regex no detectás (`"marca auto"` ↔ `marca`, `"kilometros"` ↔ `km`). Pero son **sensibles al phrasing del input** — el mismo prompt con orden distinto puede devolver mappings distintos. La conclusión práctica es **envolverlos en lógica determinística que los estabilice**: diccionario de aliases primero, LLM solo para lo que no matcheó, y persistir el mapping aprobado para que la próxima vez no se vuelva a calcular.

---

## 1. Arquitectura objetivo

```
                  ┌──────────────────────────────────────┐
                  │  FangioBot Frontend (Next.js)        │
                  │  ┌────────────────────────────────┐  │
                  │  │ "Conectar inventario"          │  │
                  │  │   Drag XLSX → Sheet en Drive   │  │
                  │  │   FangioBot (Ruta 3 MVP)       │  │
                  │  │ Mapping UI (det + LLM)         │  │
                  │  └─────────────┬──────────────────┘  │
                  └────────────────┼──────────────────────┘
                                   │ POST /api/inventory/connect
                                   ▼
                  ┌──────────────────────────────────────┐
                  │  FangioBot Backend (Node API Routes) │
                  │   ├─ Drive API: subir XLSX → Sheet   │
                  │   ├─ Apps Script API: bind script    │
                  │   │   con trigger onEdit instalable  │
                  │   ├─ Persistir tenant_schema_map     │
                  │   └─ Notificar a bot-service         │
                  └────────────────┬─────────────────────┘
                                   │ HTTP (sheet creado)
                                   ▼
                  ┌──────────────────────────────────────┐
                  │  Sheet del Cliente (en Drive Fangio) │
                  │   + Apps Script bound:               │
                  │     - Trigger onEdit instalable      │
                  │     - POST a bot-service con         │
                  │       { tenantId, sheetId, row,      │
                  │         values, header, ts }         │
                  └────────────────┬─────────────────────┘
                                   │ POST /webhook/sheets/edit
                                   ▼
                  ┌──────────────────────────────────────┐
                  │  bot-service (Python/FastAPI)        │
                  │   webhook/sheets.py                  │
                  │   ├─ ingest/mapping.py  (det + LLM)  │
                  │   ├─ ingest/diff.py     (content_hash)│
                  │   ├─ ingest/classifier.py (8 campos) │
                  │   ├─ ingest/embedder.py  (OpenAI)    │
                  │   ├─ ingest/mongo.py     (upsert)    │
                  │   └─ ingest/reconciler.py (cron)     │
                  └────────────────┬─────────────────────┘
                                   │
                                   ▼
                  ┌──────────────────────────────────────┐
                  │  Plano de Datos (MongoDB Atlas)      │
                  │   inventory_{tenantId}  (vector idx) │
                  │   inventory_audit_{tenantId}         │
                  │   tenant_schema_map (compartida)     │
                  │   tenant_sheet_registry (compartida) │
                  └────────────────┬─────────────────────┘
                                   │
                                   ▼
                  ┌──────────────────────────────────────┐
                  │  Plano de Query (Trebol Bot Python)  │
                  │   Tool: structured_filter (Mongo)    │
                  │   Tool: semantic_search ($vector)    │
                  └──────────────────────────────────────┘
```

**No se agregan**: Qdrant, Pinecone, Paperclip, BullMQ, workers Node. Mongo Atlas Vector Search ya está en el stack y aguanta cientos de tenants × miles de autos sin problema. El módulo `ingest/` corre dentro del proceso del bot — un container, dos endpoints (`/webhook/chatwoot` y `/webhook/sheets/edit`).

---

## 2. Schema canónico del inventario

Cada documento en `inventory_{tenantId}` tiene esta forma. Idéntico al pipeline actual de Trébol — no inventamos lo que ya funciona.

```jsonc
{
  "_id": "<row_id>",                 // SHA-1(tenantId + business_key) — estable
  "tenant_id": "el-trebol",
  "content_hash": "<sha-1>",         // fingerprint del contenido normalizado
  "source": {
    "sheet_id": "<google_sheet_id>",
    "row_index": 42,                 // índice 1-based en el Sheet
    "last_edit_at": "2026-05-05T..."
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

  // METADATA cruda original — para auditar mappings y debugging
  "raw_row": { "Marca": "Toyota", "Modelo": "Hilux SRX", ... }
}
```

**Por qué `_id = SHA-1(tenant_id + business_key)`**:
- Estable entre ediciones (mismo auto = mismo `_id` aunque cambie de fila).
- No depende de columna A con AppScript que escriba el ID — el ID lo calcula el worker Python al recibir el webhook.
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

## 3. Las tres piezas del sistema

### Pieza 1 — Trigger en Google Sheets (Apps Script)

El sheet del cliente vive en Drive de FangioBot (sección 4 explica cómo llega ahí). Tiene un script bound con esta lógica:

```javascript
// Apps Script bound al sheet — auto-instalado por FangioBot al onboarding
const TENANT_TOKEN = "<inyectado al crear el script>";
const TENANT_ID    = "<inyectado al crear el script>";
const WEBHOOK_URL  = "https://test-trebol.bot.kairosaisolutions.com/webhook/sheets/edit";

function onEditInstallable(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const rowIdx = e.range.getRow();
  if (rowIdx === 1) return; // header row

  // Capturar fila completa, no solo la celda editada,
  // para que el backend tenga todos los campos del auto
  const lastCol = sheet.getLastColumn();
  const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const valuesRow = sheet.getRange(rowIdx, 1, 1, lastCol).getValues()[0];

  const payload = {
    tenant_id: TENANT_ID,
    sheet_id: SpreadsheetApp.getActiveSpreadsheet().getId(),
    sheet_name: sheet.getName(),
    row_index: rowIdx,
    headers: headerRow,
    values: valuesRow,
    edited_cell: { row: rowIdx, col: e.range.getColumn(), old: e.oldValue, new: e.value },
    timestamp: new Date().toISOString()
  };

  UrlFetchApp.fetch(WEBHOOK_URL, {
    method: "post",
    contentType: "application/json",
    headers: { "X-Tenant-Token": TENANT_TOKEN },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}
```

El trigger se instala via Apps Script API al onboardear al cliente (sección 4) — el cliente nunca abre el editor de scripts.

### Pieza 2 — Normalización de columnas (una vez por tenant)

Al onboarding, FangioBot lee headers + sample de filas y arma el mapping con dos capas:

#### Capa 1 — Diccionario determinístico (cubre el 80%)

```
matchScore(headerXLSX, canonicalField):
  1. exact match (case-insensitive, sin tildes, sin espacios) → 1.0
  2. alias match contra diccionario por idioma                → 0.95
  3. fuzzy (jaro-winkler) > 0.85                              → 0.7-0.9
```

Diccionario ES inicial (en `bot-service/trebol_bot/ingest/aliases.py`):

```python
ALIASES_ES = {
    "marca":         {"marca", "marca auto", "fabricante", "brand", "make"},
    "modelo":        {"modelo", "mod", "version", "model"},
    "anio":          {"año", "anio", "ano", "year", "año fab", "modelo año"},
    "km":            {"km", "kms", "kilometros", "kilómetros", "mileage"},
    "precio_usd":    {"contado", "precio", "precio contado", "precio usd", "usd", "price"},
    "precio_ars":    {"precio ars", "ars", "pesos", "precio pesos"},
    "color":         {"color", "colour"},
    "patente":       {"patente", "dominio", "plate", "license"},
    "chasis":        {"chasis", "vin", "n chasis", "numero chasis"},
    "sku_dealer":    {"sku", "id interno", "codigo", "code", "ref"},
    "estado":        {"estado", "status", "disponible", "situacion"},
    "page_content_extra": {"observaciones", "obs", "detalles", "descripcion", "comentarios", "notes"}
}
```

#### Capa 2 — LLM fallback (gpt-4.1-nano, solo headers no resueltos)

Mandás solo las columnas con score < 0.7 + 5 filas de ejemplo + lista de campos canónicos. El LLM devuelve JSON con mapping y confidence por columna.

```python
# Pseudocódigo en bot-service/trebol_bot/ingest/mapping.py
def map_headers_llm(unresolved_headers, sample_rows, canonical_fields):
    prompt = f"""
    Mapeá cada header de Google Sheets al campo canónico que mejor lo represente.
    Si no hay match razonable, devolvé null para ese header.
    Para cada mapeo, devolvé un confidence score entre 0 y 1.

    Headers sin resolver: {unresolved_headers}
    Sample de valores: {sample_rows}
    Campos canónicos disponibles: {canonical_fields}

    Devolvé JSON: {{ "<header>": {{ "field": "<canonical>", "confidence": 0.X }} }}
    """
    # ... llamada al LLM con response_format=json_object
```

**Estabilización del LLM** (lección de [arXiv 2505.18299](https://arxiv.org/abs/2505.18299)): si un header tiene confidence < 0.7 después del LLM, **se le pide confirmación al usuario** en la UI de mapping. Si confidence ≥ 0.7, se aplica automático. Esto baja el riesgo de "outputs impredecibles" sin agregar el costo de samplear múltiples llamadas.

#### Persistencia

El mapping aprobado se guarda en `tenant_schema_map`:

```jsonc
{
  "_id": "el-trebol",
  "version": 3,
  "sheet_id": "1QBxyYP5...",
  "mapping": {
    "Marca": "marca",
    "Modelo Detallado": "modelo",
    "Año": "anio",
    "Kilom.": "km",
    "Observ.": "page_content_extra"
  },
  "ignored_columns": ["Color interior", "Vendedor"],
  "headers_signature": "<sha-1 de headers para detectar drift>",
  "updated_at": "2026-05-05T...",
  "approved_by": "user_id_xxx"
}
```

Si en un webhook futuro `headers_signature` cambia (cliente agregó/borró columna), se vuelve a pedir aprobación antes de procesar.

### Pieza 3 — Sync al vector store (en cada webhook)

```
1. webhook/sheets.py recibe POST con payload de Apps Script
2. Validar X-Tenant-Token contra tenant_sheet_registry
3. Cargar tenant_schema_map[tenant_id]
4. Aplicar mapping → row canónica
5. Calcular row_id + content_hash
6. Buscar en Mongo: existing = inventory_{tenant_id}.findOne({_id: row_id}, {content_hash: 1})
7. Decidir:
     - INSERT     si existing == null
     - UPDATE     si existing.content_hash != new content_hash
     - SKIP       si existing.content_hash == new content_hash
8. Si INSERT/UPDATE:
     a. Clasificar (LLM 8 campos) si los campos no vienen del sheet
     b. Construir page_content con sinónimos
     c. Embedding (text-embedding-3-small)
     d. Upsert en inventory_{tenant_id}
9. Loggear en inventory_audit_{tenant_id}
```

**Solo se reembede la fila que cambió, no todo el inventario.** Si el cliente edita "precio" en una fila, solo esa fila pasa por classifier + embedder. El resto del inventario no se toca.

---

## 4. Onboarding del cliente — Ruta 3 (MVP)

El cliente jamás toca código. El flujo es:

1. Cliente entra a FangioBot → "Conectar inventario"
2. Drag-and-drop de su `inventario.xlsx` (o pegar URL de un Google Sheet existente — fallback)
3. **Backend de FangioBot** (nodo Next.js):
   a. Sube el XLSX a Drive en cuenta de servicio de FangioBot, **convertido a Google Sheet** (vía Drive API `mimeType: application/vnd.google-apps.spreadsheet`)
   b. Comparte el sheet con el email del cliente con permiso `writer`
   c. Genera `tenant_token` aleatorio (32 chars), persiste en `tenant_sheet_registry`
   d. Llama Apps Script API: crea proyecto bound al sheet, sube el código del trigger con `TENANT_TOKEN` y `TENANT_ID` inyectados como constantes
   e. Apps Script API: instala trigger `onEditInstallable` con función `onEditInstallable`
   f. Lee headers + 5 filas sample → llama a `bot-service` `POST /ingest/preview-mapping` para auto-mapping
4. UI muestra tabla de mapping con confianzas (sección 3, Pieza 2). Cliente confirma o edita.
5. UI llama `POST /ingest/confirm-mapping` → bot-service persiste en `tenant_schema_map`
6. UI llama `POST /ingest/initial-sync` → bot-service lee el sheet completo via Sheets API y hace bulk insert (este es el primer sync; los siguientes son por webhook)
7. Cliente recibe email "Sheet compartido contigo" → entra desde su Drive y edita normal. Cada edición dispara el webhook.

### Tradeoff explícito de la Ruta 3

El sheet vive en Drive de FangioBot, no en Drive del cliente. El cliente lo ve como "compartido conmigo". Pros: zero-touch, sin OAuth del cliente, sin scope `script.projects` que dispara warning de "unverified app", control total. Contras: si el cliente quiere usar ese sheet con otra integración propia (ej. su Zapier), el sheet no es de su Workspace.

### Ruta 2 (upgrade futuro, sprint 7+)

Cuando un cliente exija "mi sheet tiene que ser mío":
1. OAuth del cliente con scopes `drive.file` + `spreadsheets.readonly`
2. FangioBot se suscribe a `files.watch` de Drive sobre el sheet del cliente
3. Cada notificación de cambio → backend lee el sheet entero y diffea contra Mongo (mismo `content_hash`)
4. Cron de renovación de watch channel (expiran cada 7 días)

Esto evita Apps Script API completamente y deja el sheet en el Workspace del cliente. Más overhead operativo pero más limpio en términos de ownership.

---

## 5. Diff y soft delete

Por cada webhook (1 fila editada) o por cada corrida del reconciler (sheet completo):

```
upload_set (lo que vino del Sheet) vs db_set (lo que hay en Mongo)
   INSERTS = upload_set.keys - db_set.keys
   DELETES = db_set.keys - upload_set.keys           [solo el reconciler ve esto, no el webhook]
   UPDATES = intersección donde upload[id].hash != db[id].hash
   SKIPS   = intersección donde hashes coinciden
```

**Soft delete**: los DELETE no borran el doc — actualizan `estado: "no_en_agencia"` y `embedding: null`. El bot ignora docs con `estado != "disponible"` en sus queries. Después de 30 días sin volver a aparecer, un job de housekeeping los borra de verdad. Esto evita perder historial si el reconciler corre con un sheet que el cliente vació por error.

**Caso particular del webhook**: el webhook de Apps Script trae 1 sola fila editada, no puede detectar DELETE por sí solo (no sabe qué fue borrado). Los DELETE los detecta exclusivamente el cron de reconciliación (sección 9).

---

## 6. Embeddings — qué se embebe y cuándo

**Texto embebido (`page_content`)**, generado en `ingest/embedder.py` (mismo formato que SheetsToMongo v2):

```
{tipo} {marca} {modelo} {anio}. {carroceria} {traccion} {transmision} {combustible}.
{km} km. {observaciones_originales}.
Sinónimos: auto, coche, automóvil, vehículo. {tags_concatenados}.
```

Los **sinónimos por tipo** (auto/coche/vehículo, moto/motocicleta, camión/camioneta) son críticos — sin esto el RAG falla cuando el cliente dice "coche" y en el inventario dice "auto". Está documentado en [[SheetsToMongo_RAG_Inventario]].

**Cuándo se reembede**:
- INSERT → siempre.
- UPDATE → siempre (delete embedding + reinsert).
- SKIP → nunca.
- Bump de `embedding_version` → job de reembed batch que recorre toda la colección del tenant.

**Modelo**: `text-embedding-3-small` (1536 dims). Mismo que usa SheetsToMongo, el index de Atlas se reutiliza.

---

## 7. Aislamiento multi-tenant

Una colección por tenant: `inventory_{tenantId}`. Cada una con vector index `vector_index_v1`:

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

Indices estructurados por colección: `{marca:1, modelo:1, anio:1}`, `{precio_usd:1}`, `{estado:1}`.

**Bot lookup**: el bot recibe `tenant_id` desde el contexto de la conversación (vía Evolution instance). Toda tool del bot recibe `tenant_id` y construye la query contra `inventory_{tenantId}`. Sin `tenant_id` → la tool tira error y el bot deriva a admin. Tests de aislamiento obligatorios en cada PR que toque `tools.py`.

**Trade-off vs colección compartida**: elegimos una por tenant porque (a) aislamiento físico — una query nunca puede leakear a otro tenant, (b) backups granulares, (c) indices optimizados por tenant. Cuando lleguemos a 200+ tenants evaluamos consolidar; hoy no es problema.

---

## 8. Servicios concretos a construir

### 8.1 En `bot-service/` (Python/FastAPI)

```
bot-service/trebol_bot/
├── ingest/                          # NUEVO MÓDULO
│   ├── __init__.py
│   ├── schema.py                    # CanonicalRow, validación pydantic
│   ├── aliases.py                   # diccionario ES/EN de aliases por campo
│   ├── mapping.py                   # auto-mapping deterministic + LLM fallback
│   ├── diff.py                      # content_hash + INSERT/UPDATE/DELETE/SKIP
│   ├── classifier.py                # LLM clasifica los 8 campos (carroceria, etc.)
│   ├── embedder.py                  # build page_content + OpenAI embeddings
│   ├── mongo.py                     # upsert/delete a inventory_{tenantId}
│   ├── reconciler.py                # cron diario, lee sheet entero via Sheets API
│   ├── audit.py                     # write a inventory_audit_{tenantId}
│   └── tenant_registry.py           # tenant_sheet_registry CRUD + token validation
│
├── webhook/
│   ├── chatwoot.py                  # ya existe
│   ├── fangiocrm.py                 # ya existe
│   └── sheets.py                    # NUEVO: POST /webhook/sheets/edit
│                                    #         + valida X-Tenant-Token
│                                    #         + delega a ingest/
│
└── main.py                          # registrar router de sheets.py
```

### 8.2 En el repo `FangioBot` (Next.js + Node)

| Pieza | Tipo | Responsabilidad |
|---|---|---|
| `POST /api/inventory/connect` | API Route | Recibe XLSX, lo sube a Drive de FangioBot como Sheet, instala Apps Script |
| `POST /api/inventory/connect-existing` | API Route | (Ruta 2 futuro) recibe URL de sheet del cliente + OAuth |
| `lib/google/driveClient.ts` | Lib | Service account + Drive API (upload, share) |
| `lib/google/scriptClient.ts` | Lib | Apps Script API (create project, deploy, install trigger) |
| `lib/google/scriptTemplate.ts` | Lib | Template del Apps Script con placeholders `{{TENANT_TOKEN}}` `{{TENANT_ID}}` |
| `components/inventory/ConnectFlow.tsx` | React | Wizard de 3 pasos (drag → mapping → confirm) |
| `components/inventory/MappingTable.tsx` | React | Tabla de mapeo confirmable (consume preview de bot-service) |
| `components/inventory/SyncStatus.tsx` | React | Estado live del sheet (último cambio, errores, items) |

### 8.3 Compartido (decisión sprint 0)

| Pieza | Dónde |
|---|---|
| `tenant_schema_map` collection | Mongo Atlas (escribe FangioBot al onboarding, lee bot-service en cada webhook) |
| `tenant_sheet_registry` collection | Mongo Atlas (escribe FangioBot, lee bot-service para validar X-Tenant-Token) |
| `inventory_{tenantId}` collections | Mongo Atlas (lee/escribe bot-service, solo lee FangioBot para UI de audit) |

---

## 9. Cron de reconciliación (red de seguridad)

`onEdit` instalable no captura:
- Cambios via Sheets API (ej. ERP del cliente que hace bulk update programático)
- Borrado de filas con "Delete row" en algunos casos edge
- Ediciones cuando el trigger fue desautorizado por error

Por eso, **1×/día** el reconciler corre por cada tenant activo:

```
1. Lee tenant_sheet_registry → todos los sheets activos
2. Por cada sheet, lee filas vía Sheets API (service account de FangioBot)
3. Calcula content_hash de cada fila
4. Diff vs Mongo (inventory_{tenantId})
5. Aplica INSERT/UPDATE/DELETE/SKIP (en este caso DELETE = soft delete real)
6. Audit en inventory_audit_{tenantId} con flag source: "reconciler"
```

**Frecuencia**: arrancamos con 1×/día (4am UTC, baja carga). Si vemos divergencia frecuente entre webhook y reconciler, subimos a 4×/día. Si vemos casi nunca divergencia, bajamos a 1×/semana.

---

## 10. Sprints — ejecución

> **Regla**: cada sprint cierra con tests verdes, doc actualizada en este archivo (sección Estado), y demo en test antes de pasar al siguiente.

### Sprint 0 — Fundaciones (1 semana)

- [ ] Crear módulo `bot-service/trebol_bot/ingest/` con stubs vacíos + tests básicos.
- [ ] Definir `CanonicalRow` pydantic en `ingest/schema.py` con tests de validación.
- [ ] Crear collections base en Mongo Atlas: `tenant_schema_map`, `tenant_sheet_registry`, `inventory_audit_template` (cómo crear las `inventory_{tenantId}` y sus indexes via script).
- [ ] Decidir **dónde corre el reconciler cron**: A) APScheduler dentro del proceso del bot (más simple, riesgo de competir con el bot al correr) · B) Container `cron` aparte que invoca un endpoint del bot · **C) GitHub Actions cron que llama al endpoint** (más simple, sin nuevo container).
- [ ] Decidir si el `tenant_token` se rota nunca o se rota cada 90 días.
- [ ] Aprovisionar service account de Google para FangioBot (Drive + Sheets + Apps Script API). Documentar scopes.

### Sprint 1 — Mapping engine en bot-service (1 semana)

- [ ] `ingest/aliases.py` con diccionario ES inicial.
- [ ] `ingest/mapping.py` con deterministic match + alias + jaro-winkler. Tests unitarios al 100%.
- [ ] LLM fallback con `gpt-4.1-nano` y prompt versionado. Test con golden cases (Trébol headers reales).
- [ ] `POST /ingest/preview-mapping` endpoint en bot-service (recibe headers + sample, devuelve mapping + confidences).
- [ ] `POST /ingest/confirm-mapping` endpoint (persiste en `tenant_schema_map`).
- [ ] **Demo**: llamar al endpoint con headers de Trébol → ver mapping correcto sin tocar nada.

### Sprint 2 — Drive + Apps Script onboarding desde FangioBot (1 semana)

- [ ] `lib/google/driveClient.ts` (subir XLSX → Sheet, share con email).
- [ ] `lib/google/scriptTemplate.ts` (template del trigger con placeholders).
- [ ] `lib/google/scriptClient.ts` (Apps Script API: create project bound, deploy, install trigger).
- [ ] `POST /api/inventory/connect` end-to-end: recibe XLSX → crea Sheet → instala script → llama a bot-service preview-mapping.
- [ ] `ConnectFlow.tsx` + `MappingTable.tsx` funcionando.
- [ ] **Demo**: arrastrar XLSX dummy → Sheet creado en Drive de FangioBot → ver script instalado en el editor → editar una celda manualmente → ver el POST llegando a un endpoint de eco en bot-service.

### Sprint 3 — Diff + Classifier + Embedder en bot-service (1 semana)

- [ ] `ingest/diff.py` puro y testeable (sin Mongo). 100% cobertura.
- [ ] `ingest/classifier.py` reusa el prompt de `scripts/backfill_classify_inventario.py`.
- [ ] `ingest/embedder.py` con OpenAI `text-embedding-3-small` y batching.
- [ ] `ingest/mongo.py` con upsert atómico + soft delete.
- [ ] `webhook/sheets.py` end-to-end: valida token → mapea → diffea → classifier → embedder → upsert.
- [ ] **Demo**: editar 1 celda en el sheet de demo → ver el doc en Mongo actualizado en <5s con embedding fresco.

### Sprint 4 — Initial sync + reconciler (1 semana)

- [ ] `POST /ingest/initial-sync` endpoint (lee sheet completo via Sheets API y bulk insert).
- [ ] `ingest/reconciler.py` con la lógica de diff completa (incluye DELETE).
- [ ] Cron infrastructure (decisión de Sprint 0): GitHub Actions o container cron.
- [ ] Audit table con todos los eventos.
- [ ] **Demo**: borrar una fila del sheet → al día siguiente el reconciler la marca como `no_en_agencia`.

### Sprint 5 — Bot consume el inventario nuevo (1 semana)

- [ ] Generalizar tool `buscar_inventario_autos` en `bot-service/trebol_bot/agent/tools.py` para recibir `tenant_id` y armar la colección dinámicamente.
- [ ] Agregar tool `filtrar_inventario_estructurado` (queries Mongo exactas: marca + año + precio range).
- [ ] El AI Agent del bot decide cuál usar según la query del cliente.
- [ ] **Test golden**: regresión `bash scripts/test_bot.sh all` debe seguir 23/23.
- [ ] **Demo**: bot Trébol contestando con stock leído desde la colección nueva (paralelo al pipeline viejo, sin romperlo).

### Sprint 6 — UI de Audit + housekeeping (1 semana)

- [ ] Vista en FangioBot: histórico de uploads, qué cambió, errores.
- [ ] Job cron diario: items con `estado: "no_en_agencia"` por más de 30 días → hard delete.
- [ ] Job cron diario: detectar drift entre `tenant_schema_map.headers_signature` y headers reales (alert si cambió).
- [ ] Métricas: `inventory_items_total{tenant_id}`, `inventory_sync_duration_seconds`, `inventory_embedding_cost_usd_total`.

### Sprint 7 — Cutover Trébol y deprecación SheetsToMongo (1 semana)

- [ ] Crear sheet nuevo en Drive de FangioBot con el inventario actual de Trébol (importado desde `RAGtrebol.propiedades-test`).
- [ ] Compartir con santi+admin del Trébol con permiso editor.
- [ ] Apps Script instalado, mapping configurado, initial sync corrido.
- [ ] Apuntar el bot Trébol test a `inventory_el-trebol`.
- [ ] Correr en paralelo 1 semana (SheetsToMongo v2 + nuevo pipeline), comparando respuestas del bot.
- [ ] Si todo OK: deprecar `SheetsToMongo v2` (workflow `4atsII1pbYHYtOFVYzaVa`) — ya estaba apagado para PROD desde 2026-05-02.
- [ ] Documentar en `Trebol/SheetsToMongo_RAG_Inventario.md` el archivado.

### Sprint 8 — Onboarding del segundo tenant (1 semana)

- [ ] Crear tenant nuevo desde la UI de FangioBot.
- [ ] Subir XLSX del cliente nuevo.
- [ ] Conectar Evolution + bot.
- [ ] Validar aislamiento (queries del tenant 1 jamás ven datos del tenant 2).

### Sprint 9+ (opcional) — Ruta 2 (OAuth + Drive watch para sheet del cliente)

- [ ] OAuth flow con scopes mínimos.
- [ ] Drive watch + renewal cron.
- [ ] Mismo backend pipeline, distinto adapter de fuente.
- [ ] UI: el cliente elige "subir XLSX" (Ruta 3) o "conectar mi sheet existente" (Ruta 2).

---

## 11. Decisiones abiertas

| # | Pregunta | Estado |
|---|---|---|
| D1 | ¿Reconciler en APScheduler / container cron / GitHub Actions? | **Pendiente Sprint 0** |
| D2 | Schema canónico: ¿incluir `precio_ars` además de `precio_usd` desde día 1? | A) Solo USD (Trébol opera así) · B) Ambos con conversión automática |
| D3 | ¿Soportar URL de sheet existente como fallback de "drag XLSX"? | A) MVP solo XLSX · B) Aceptar URL pero forzar copia al Drive de FangioBot (no Ruta 2 todavía) |
| D4 | ¿Token validation del webhook = X-Tenant-Token simple o HMAC firmado? | Decisión del usuario (ver punto 4 de la conversación de planeo) |
| D5 | ¿Trébol mantiene su sheet propio o se le crea uno nuevo en Drive de FangioBot? | A) Nuevo sheet (consistencia con resto de tenants) · B) Conectar el actual via Ruta 2 anticipada |

---

## 12. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Apps Script API rompe al cambiar Google su política de scripts no verificados | Media | Alto | Service account de FangioBot con verification → reduce alertas. Ruta 2 como plan B no depende de Apps Script API. |
| Cliente edita el sheet desde mobile y el trigger no dispara | Baja | Bajo | Triggers instalables corren server-side, no dependen del cliente. Reconciler atrapa lo perdido. |
| Cliente borra accidentalmente el sheet desde "compartido conmigo" | Media | Bajo | El sheet vive en Drive de FangioBot, "borrar" del cliente solo lo saca de su lista. |
| Cliente cambia headers (renombra columna) y rompe el mapping | Alta | Medio | Webhook detecta `headers_signature` cambiado → marca tenant como `mapping_drift` → UI pide reconfirmación, sync pausado hasta confirmar. |
| Token leak (Apps Script visible al cliente con permiso editor) | Media | Bajo | El cliente con permiso editor SÍ puede leer el script y ver el token. Mitigación: token es scoped a su tenant — un atacante con ese token solo puede inyectar filas como ese tenant, no leakear cross-tenant. Si hay incidente, rotar token desde la UI. |
| LLM mapping devuelve mappings inestables turno a turno | Media | Medio | Confidence < 0.7 → confirmación humana obligatoria. Mapping aprobado se persiste y nunca se recalcula. |
| Re-embed masivo cuando bumpeamos prompt de `page_content` | Media | Costo $$ | Versionado de embedding + reembed selectivo solo si cambia el prompt. |
| Worker se cuelga procesando una fila con datos corruptos | Media | Bajo | Timeout por request (30s) + retry con backoff + dead letter en `inventory_audit_{tenant}` con flag `error`. |
| Aislamiento roto: tenant A ve stock de tenant B | Baja | **Crítico** | Tests de aislamiento en cada PR + middleware obligatorio que inyecta `tenant_id` en toda query. |

---

## 13. Estado

- **2026-05-04**: documento creado (versión XLSX upload + BullMQ workers).
- **2026-05-05**: pivot completo. Reescrito a pipeline live Sheets + Apps Script + bot-service Python. Decisiones D1-D5 abiertas para Sprint 0.

---

## Referencias

- [[SheetsToMongo_RAG_Inventario]] — pipeline actual de Trébol (lógica fuente, schema, sinónimos)
- [[FangioBot_v2_Architecture]] — pipeline n8n actual de FangioBot (a deprecar gradualmente)
- [[Trebol_Bot_Embedded]] — cómo se embebe Trebol Bot dentro de FangioBot
- [[Arquitectura_SaaS_Multitenant]] — topología actual
- [[Pipeline_v4]] — referencia de bot Trébol producción
- [Apps Script installable triggers — docs](https://developers.google.com/apps-script/guides/triggers/installable)
- [Apps Script API — manage scripts programmatically](https://developers.google.com/apps-script/api)
- [Drive API — files.watch](https://developers.google.com/drive/api/v3/reference/files/watch)
- [Schema mapping con LLMs — arXiv 2505.18299](https://arxiv.org/abs/2505.18299)
