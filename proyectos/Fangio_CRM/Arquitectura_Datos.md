---
tags: [fangiocrm, arquitectura, mongodb, vercel, modelos]
fecha: 2026-05-05
estado: documentado a partir del repo /root/apps/FangioCRM
relacionado: [[FangioBot]], [[Roadmap_Stock_Ingestion_v1]], [[Trebol_Bot_Embedded]]
---

# Arquitectura de Datos — FangioBot

Mapa de cómo se conectan FangioBot (Next.js, Vercel) y Trebol Bot (Python, VPS), qué Mongo usa cada uno, y qué shape tienen los datos.

## Repos y deploy

| Pieza | Path / URL | Donde corre |
|---|---|---|
| FangioBot (Next.js) | `/root/apps/FangioCRM` (local clone) · repo `github.com/5antuca/FangioCRM` | **Vercel** (no en VPS) — el VPS solo tiene el clone para developer experience |
| FangioBot n8n stack | `/root/apps/fangiocrm-infra/docker-compose.yml` | VPS — solo `fangiocrm-n8n-master`, `fangiocrm-n8n-worker-1`, `fangiocrm-n8n-redis`, `fangiocrm-n8n-db` (Postgres del propio n8n) |
| Trebol Bot (Python) | `/root/kairos-infrastructure/bot-service/` | VPS — container `trebol-test-bot` |

**FangioBot web NO corre en el VPS**. Vive en Vercel. El stack de fangiocrm-infra en el VPS es solo el n8n del cliente, sin la app Next.js.

## Dos clusters Mongo separados

| Cluster | DB | Quién la usa | Para qué |
|---|---|---|---|
| Atlas — RAGtrebol | `RAGtrebol` | Trebol Bot (`bot-service`) | Inventario y RAG del bot. Collection `propiedades-test` (test) y `propiedades` (prod, apagada) |
| Atlas — FangioBot | `fangiocrm` | App Next.js de FangioBot (Vercel) | Datos del CRM: leads, messages, tenants, users, vehicles, tenantinventories |

**Son dos clusters distintos**. El bot Python no tiene acceso al cluster de FangioBot por default; hay que abrir conexión explícita desde `bot-service` con la URI del cluster `fangiocrm` cuando llegue el momento de leer inventario desde ahí.

## Collections en `fangiocrm` (snapshot 2026-05-05)

| Collection | Docs | Para qué |
|---|---|---|
| `leads` | 1 | Leads/clientes (Lead.ts) |
| `messages` | 108 | Historial de mensajes (Message.ts) |
| `tenantinventories` | **0** | Estado completo de la grilla UI (ver shape abajo) |
| `tenants` | 1 | Configuración por tenant (Tenant.ts) |
| `users` | 1 | Usuarios del CRM (User.ts) |
| `vehicles` | 0 | Schema canónico de auto individual (Vehicle.ts) — **nadie lo está poblando hoy** |

> **0 docs en `tenantinventories` y `vehicles`** = el flujo de inventario en FangioBot no se ha guardado todavía a la base. Hay UI (`InventoryGrid.tsx`) y hay endpoint (`/api/inventory`), pero el usuario no le ha dado save aún (o no quedó persistido).

## Modelos clave

### `Tenant` (tenant config)

```ts
{
  tenantId: string,            // unique. Ej: "eltrebollll" | "el-trebol"
  nombre: string,
  plan: 'basic' | 'pro',
  twilioNumber, promptBase, tasaFinanciacion, detallesFinanciacion,
  instagramUrl, facebookUrl, instruccionesVenta, reglasAgente,
  evoInstanceName, evoApiKey,
  whatsappActivated: boolean,  // gate global del bot — solo true tras escanear QR
  botClientId?: string,        // ← BRIDGE al client_id del bot Python (LangGraph)
  limiteAutos: number,
  limiteMensajes, mensajesConsumidos
}
```

**El bridge clave**: `Tenant.botClientId` = `client_id` que usa `bot-service`. Si no está seteado, FangioBot cae a un mapeo defensivo (`lib/ai.ts` línea 22):

```ts
const TREBOL_TENANT_ALIASES = new Set(['eltrebollll', 'el-trebol', 'eltrebol', 'trebol']);
const botClientId =
  tenantAny.botClientId ||
  (TREBOL_TENANT_ALIASES.has(tenant.tenantId) ? 'trebol' : tenant.tenantId);
```

**FangioBot llama al bot Python via HTTP**:
- URL default: `https://test-trebol.bot.kairosaisolutions.com`
- Override en dev local: `TREBOL_BOT_URL=http://trebol-bot:8000`
- Body: `{ client_id: botClientId, ... }`

### `TenantInventory` (estado de la grilla UI)

```ts
{
  _id: ObjectId,
  tenantId: string,            // unique — un solo inventario por tenant
  gridState: Mixed,            // ver shape abajo
  createdAt, updatedAt
}
```

#### Shape de `gridState` (sacado de `InventoryGrid.tsx:23-29`)

```ts
type GridState = {
  data: Record<string, CellData>,         // key: "rowID-colID"
  colWidths: number[],
  rowHeights: number[],
  columns: { id: string; label: string; colType?: ColType }[],  // colType ∈ "currency"|"km"|"year"|"text"
  rows: string[]                          // ["row-init-0", "row-init-1", ...]
};

type CellData = {
  value: string,
  isImage: boolean,
  align?, bold?, italic?, textColor?, bgColor?, fontSize?
};
```

**Inicialización** (`InventoryGrid.tsx:328-348`):
- 51 filas iniciales (`row-init-0` a `row-init-50`)
- 30 columnas iniciales (`col-init-0` a `col-init-29`)
- Primera fila (`row-init-0`) es la de **headers** con valores en MAYÚSCULA
- Headers default (primeros 11): `Marca`, `Modelo`, `Año`, `KM`, `Contado`, `Anticipo`, `Permuta`, `Transferencia aprox`, `Combustible`, `Fotos`, `Color/Detalles`
- Columnas restantes (12-29) tienen labels A, B, C... (vacías por default)

**Cómo expandir gridState a docs**:

```python
# Pseudocódigo — orden lógico
header_row_id = grid["rows"][0]
headers = [grid["data"][f"{header_row_id}-{c['id']}"]["value"]
           for c in grid["columns"]]
docs = []
for row_id in grid["rows"][1:]:           # filas 1..N (saltar header)
    row = {}
    for col, header in zip(grid["columns"], headers):
        cell = grid["data"].get(f"{row_id}-{col['id']}")
        if cell and cell.get("value"):
            row[header] = cell["value"]
    if row:                                # filas vacías se descartan
        docs.append({"tenantId": tenant_id, "rowId": row_id, **row})
```

**Detección de tipo de columna** (`detectColType` en `InventoryGrid.tsx:62-68`) — heurística por substring del label:
- `currency`: `contado`, `anticipo`, `transferencia`, `precio`, `valor`, `permuta`
- `km`: `km`, `kilom`
- `year`: `año`, `year`, `anno`
- `text`: el resto

### `Vehicle` (schema canónico — sin uso hoy)

```ts
{
  tenantId: string,
  marca: string, modelo: string, año?: number, km?: number,
  precio?: number, anticipo?: number, combustible?: string,
  detalles?: string, fotos?: string[],
  embedding?: number[],          // ← campo previsto para vector search desde FangioBot
  rowId?: string,                // referencia a row en gridState
  createdAt, updatedAt
}
```

**Estado**: 0 docs. La idea original parece haber sido que FangioBot expandiera `gridState` → `Vehicle[]` al guardar y embedeara ahí. Hoy no pasa nada de eso. Hay dos approaches viables (D-Approach1 y D-Approach2 en sección Decisiones abiertas del [[Roadmap_Stock_Ingestion_v1]]).

## XLSX Upload (cómo funciona hoy)

1. Usuario va a la sección de Inventario en FangioBot
2. Drag XLSX → `xlsx.utils.sheet_to_json(worksheet, { header: 1 })` lo parsea client-side (browser)
3. Los datos se cargan en el reducer del grid via `IMPORT_DATA`
4. Detección automática de tipo por nombre de header (`detectColType`)
5. Usuario edita celdas, fotos, etc.
6. **Cliquea Save** → `POST /api/inventory` con `{ gridState: state }`
7. Backend (`/api/inventory/route.ts`) hace `findOneAndUpdate({ tenantId }, { gridState }, { upsert: true })` en `tenantinventories`
8. **Aquí termina el flow hoy.** No notifica a nadie, no expande a `Vehicle`, no embede.

## Cómo se conectan hoy FangioBot ↔ Bot Python (mensajes, no inventario)

```
WhatsApp → Evolution API → bot Python (/webhook/chatwoot o /webhook/fangiocrm)
                                ↓
                         responde via Evolution
                                ↓
                         persiste mensaje
                                ↓
              FangioBot lee `messages` collection
              de Mongo y muestra en UI
```

Para **inventario** todavía no hay conexión bidireccional. El bot Python lee de `RAGtrebol.propiedades-test` (cluster del bot, poblado por workflow n8n SheetsToMongo v2 desde Google Sheet de Trebol). FangioBot tiene `tenantinventories` y `vehicles` vacíos.

## Cuándo importa esto

- **Plan de ingesta de stock** (ver [[Roadmap_Stock_Ingestion_v1]]): el pivot post-pivot del 2026-05-05 propone que **FangioBot sea la UI de inventario** y el bot Python lea de `tenantinventories` o `vehicles` cluster `fangiocrm`. Eso requiere que el bot tenga la URI del cluster de FangioBot.
- **Multi-tenant del bot**: el `client_id` que usa el bot tiene que mapear al `tenantId` de FangioBot. Hoy hay un alias hardcodeado para `trebol`. Cuando llegue tenant 2, hay que setear `Tenant.botClientId` o expandir aliases.

## Referencias

- `/root/apps/FangioCRM/src/models/{Tenant,TenantInventory,Vehicle,Lead,Message,User}.ts`
- `/root/apps/FangioCRM/src/components/InventoryGrid.tsx`
- `/root/apps/FangioCRM/src/app/api/inventory/route.ts`
- `/root/apps/FangioCRM/src/lib/ai.ts`
- `/root/apps/fangiocrm-infra/docker-compose.yml` (solo n8n stack)
- [[FangioBot]] — overview general
- [[Roadmap_Stock_Ingestion_v1]] — roadmap de ingesta (post-pivot 2026-05-05)
