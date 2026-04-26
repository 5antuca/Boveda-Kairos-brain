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

## ⚠️ Estado de las colecciones MongoDB (audit 2026-04-26)

Tres colecciones coexisten en la base `RAGtrebol`:

| Colección | Docs | TIPOs | Última act. | Estado |
|---|---:|---|---|---|
| `propiedades` | 6 | Acuatico, Maquinaria, Moto | reciente | **🔴 ROTA** — bug del sync, faltan los Vehiculos |
| `propiedades-test` | 59 | Vehiculo, Moto, Camion, Maquinaria, Acuatico | 2026-03-02 | ✅ buena para test |
| `conversaciones-feedback-test` | 2 | (n/a) | — | otra finalidad |

**Causa de `propiedades` rota** (confirmado por usuario): le borraron al Google Sheet la columna ID que usa el sync para matchear, así que el SheetsToMongo no puede actualizar correctamente y dejó la colección con basura (motos viejas + maquinaria, sin autos).

**Decisión 2026-04-26**: el bot test apunta a `propiedades-test` (`bot-service/configs/trebol.yaml`). PROD sigue con `propiedades` (todavía no se decidió cuándo restaurar el ID en el Sheet).

## Bug conocido — DESC duplicado en docs

Algunos docs tienen el campo `DESC` repetido N veces sin separador:
```
"gris, 5 puertas, unico dueño, transmision manual gris, 5 puertas, unico dueño, transmision manualgris, 5 puertas, unico dueño..."
```

Causa: el sync de Sheets no normaliza el campo cuando la cell tiene texto formato wrap o duplicación accidental.

**Workaround en el bot**: `_dedupe_repeated_text()` en `bot-service/trebol_bot/agent/tools.py` detecta el período mínimo del texto y devuelve solo la primera ocurrencia. Reduce de 200 chars → 28 chars en docs afectados (-86%).

Esto NO arregla la causa raíz, solo el rendering en las fichas que el bot le pasa al LLM. Para arreglar de verdad hay que limpiar el campo en la fuente (Sheet) o agregar un dedupe en el Code node de SheetsToMongo.

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
