---
tags: [memoria, volcado, mongodb, rag, sheets, inventario, embeddings]
fecha_volcado: 2026-04-13
workflow_id: 4atsII1pbYHYtOFVYzaVa
---

# SheetsToMongo v2 + RAG Inventario

Pipeline que mantiene sincronizado el inventario de vehículos desde Google Sheets hacia MongoDB Atlas con embeddings para el tool `buscar_inventario_autos` del AI Agent de [[Pipeline_v4|Trebol v4]].

## Identificadores

- **Workflow ID prod**: `4atsII1pbYHYtOFVYzaVa`
- **Archivo**: `workflows/sheets_to_mongo_v2.json`
- **Cron**: `0 0 8,13,17,20 * * *` (4x/día: 8, 13, 17, 20 AR)
- **Docs fuente**: Google Sheets inventario (docId en `$env.SHEETS_INVENTARIO_DOC_ID`)
- **Destino**: MongoDB Atlas collection `$env.MONGO_COLLECTION` con vector search index

## Tabs sincronizados (5 tipos)

| Tab | gid | TIPO metadata |
|---|---|---|
| Vehiculos | `0` | Vehiculo |
| Nautico | `253929510` | Acuatico |
| Motos | `509017185` | Moto |
| Camiones | `1980478262` | Camion |
| Maquinaria | `409148329` | Maquinaria |

## Lógica clave

### Classify & Prepare

Node de código que clasifica cada row del Sheet contra MongoDB en 4 estados:

- **INSERT** — row nueva, no existe en Mongo
- **UPDATE** — existe pero `pageContent` difiere (normalized compare)
- **DELETE** — row existe en Mongo pero:
  - Ya no está en el Sheet, **O**
  - Tiene estado "señado" / "no en agencia" en el Sheet
- **SKIP** — existe y no cambió

### Update = delete + reinsert

No hay "update in place" — si cambia algo, se borra la row vieja de Mongo y se inserta una nueva con **embedding fresco** generado por OpenAI. Esto garantiza que el vector embedding siempre esté sincronizado con el texto.

### Keywords RAG inyectadas por tipo

En el `pageContent` que se embebe se inyectan sinónimos de cada tipo para mejorar el recall del vector search. Ejemplo:
- Vehiculo: "auto, coche, automóvil, vehículo"
- Moto: "moto, motocicleta"
- Camion: "camión, camioneta de carga"

Sin esto, el RAG fallaba cuando el cliente decía "busco un coche" y en el Sheet solo decía "auto".

### Columna ID del Sheet

El Code node tolera 3 variantes:
```javascript
const id = item.ID || item.id || item.col_1;
```

Los tabs sin header usan `col_1` (columna A). Los con header usan `ID` o `id`.

### Queries MongoDB con `$or`

Para cubrir docs viejos (ID en raíz) y nuevos (ID en `metadata.ID`):
```javascript
{
  $or: [
    { ID: id },
    { "metadata.ID": id }
  ]
}
```

Legacy tolerance — cuando migramos al schema con metadata, no re-embebimos todo de cero, así que conviven ambos.

## Env vars requeridas

- `SHEETS_INVENTARIO_DOC_ID` — doc ID del Google Sheet fuente
- `MONGO_COLLECTION` — collection destino en Atlas

## Credentials n8n

- Google Sheets: `fgnvAapxXc3HT6lR`
- MongoDB: `LdUrhcJ7FxBoD4fF`
- OpenAI (embeddings): `U7Gr2AQALZbwD5qV`

## Vector search index en Atlas

Tipo `vectorSearch`, dimensión 1536 (ada-002 / text-embedding-3-small), similarity `cosine`. El tool `buscar_inventario_autos` del AI Agent de Trebol v4 lo consulta con `knnVector` queries.

## Debugging común

### "El bot no encuentra un auto que sí está en el Sheet"

Causas probables en orden:
1. SheetsToMongo no corrió desde que agregaste el auto (esperar próximo tick del cron o trigger manual)
2. La row tiene estado "señado" o "no en agencia" → fue clasificada como DELETE
3. El `pageContent` generado no tiene keywords RAG correctas
4. El vector search index está desactualizado (Atlas a veces tarda)

### Cómo forzar re-sync manual

Desde la UI n8n → abrir workflow `SheetsToMongo v2` → ejecutar manualmente desde el trigger cron. Tarda ~30-60s para los 5 tabs con embeddings.

### Borrar una row a mano en Mongo

```javascript
// En Atlas shell
db[process.env.MONGO_COLLECTION].deleteOne({ "metadata.ID": "123" })
```

Luego forzar re-sync para que vuelva a insertarse.

## Links

- [[Pipeline_v4]]
- [[VPS_Stack]]
- [[n8n_Gotchas]]
