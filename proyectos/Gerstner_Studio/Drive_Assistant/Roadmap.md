---
tags: [gerstner-studio, drive-assistant, roadmap, planning]
fecha-creacion: 2026-05-12
ultima-actualizacion: 2026-05-18
estado: ACTIVO — modo Chat baseline + modo Presentación en iteración intensiva
relacionado: [[Drive_Assistant]], [[Funcionamiento]], [[Tests_Regresion]], [[Sesion_2026_05_15]], [[Sesion_2026_05_18]]
---

# Roadmap Drive Assistant — Mejoras post 2026-05-12

> **Sesiones recientes**: [[Reorg_Singer_2026_05_14]] (2026-05-14),
> [[Sesion_2026_05_15]] (2026-05-15) y [[Sesion_2026_05_18]] (2026-05-18 —
> voz multi-vehículo inteligente, overhaul UX "todo en la slide", fix
> galerías con muchos videos, **+ Knowledge RAG sobre Procesos/
> Documentación: chat de proceso texto+voz, deployado en LIVE**). Foco
> intensivo en Modo Presentación
> (matching, UX, lazy-load, mirror de carpetas Procesos↔Marketing). Ver
> seccion "Próxima sesión" al final para el carry-over.

Plan de evolución desde el estado actual (folder-level matching + tags
agregados por carpeta) hacia un sistema **per-file** con búsqueda
estructurada precisa, evitando el sobrecosto de embeddings vectoriales
hasta que sea estrictamente necesario.

**Scope confirmado**: solo clásicos de alta gama (Jaguar, Aston, Porsche,
Shelby, Ferrari, Mercedes, Toyota Hilux Rally, Mustang, Bronco). Sin autos
modernos comunes (no Peugeot, Fiat, VW modernos).

**Objetivo**: que el bot responda *exactamente* a queries específicas como
"junta de capot del Singer", "llantas radio del Aston DB5", "tablero
de Singer rojo cuero".

---

## Estado actual (baseline 2026-05-12)

- 124 carpetas indexadas, 0 huérfanos.
- 944 imágenes con tags individuales en `image_vision_cache` (schema v1:
  color, carrocería, fase, parte_visible, material, tags_libres).
- Matching a nivel carpeta vía `match_folders` (path + vision_summary
  agregado de 5 muestras).
- Smart text responses tipo agente.
- Suite de regresión 15/15 ✅.

**Gap principal**: el query "junta de capot Singer" matchea la carpeta
Singer entera y devuelve fotos genéricas. El bot no busca a nivel archivo
ni distingue piezas específicas porque el schema actual es muy genérico
("parte_visible: capot" mezcla tornillos, juntas, bisagras, pintura).

> **Update 2026-05-14**: Para Modo Presentación se decidió ir por la vía
> contraria: en vez de buscar más granular, **multiplicar carpetas** (60
> nuevas) para que cada concepto tenga su carpeta dedicada. La indexación
> ahora es **folder-as-piece** sin LLM extractor — totalmente determinística.
> Ver [[Reorg_Singer_2026_05_14]]. Esto cambió el folder_tree (132 → 237
> carpetas) pero NO el schema de image_vision_cache; los chunks de matching
> a nivel archivo siguen pendientes para el modo Chat.

---

## Plan en 10 chunks (orden ratificado 2026-05-12)

| # | Chunk | Esfuerzo | Estado |
|---|---|---|---|
| 1 | Taxonomía: enum de 65 piezas curado del corpus real | 0.5d | ✅ 2026-05-12 |
| 2 | Telemetría: collection `query_log` para tunear con datos reales | 0.5d | ✅ 2026-05-12 |
| 3 | Prompt vision v2 + few-shot + `schema_version` field | 1d | ✅ 2026-05-12 |
| 4 | Validación manual del prompt en 20 imgs random | 0.5d | ✅ 17/20 OK (85%) con folder hint |
| 5 | Tag-all 100% con v2 (idempotente, ~$2-4 USD) | 0.5d | ✅ 495 imgs v2 + 108 carpetas |
| 6 | Per-file filter + canonicalización en `parse_intent` | 3d | ✅ 2026-05-12 — 22/22 regresión |
| 7 | UI admin de validación (endpoint HTML con muestra random) | 0.5d | Pendiente |
| 8 | Polling cada 15 min (NO webhooks) | 1d | ✅ 2026-05-12 — APScheduler + /admin/sync-now |
| 9 | Auto-naming via Bot Ordenador (DESPUÉS de 1 semana de uso) | 2d | Pendiente |
| 10 | Embeddings + Atlas Vector Search (SOLO si 6 no alcanza) | 5d | Backlog |

**Total**: ~10 días de trabajo activo. Cada chunk es independiente y
reversible — si uno falla, no bloquea los siguientes.

---

## Justificación de cada chunk

### 1. Taxonomía (`piezas.py`)

Enum cerrado de 60-80 piezas derivado del contenido REAL del Drive (las
47 sub-carpetas de "Procesos Singer" son el corpus de referencia perfecto:
pedaleras, espejos retrovisores, parabrisas, tablero dashboard, butacas,
alfombras, tapizado techo, llantas, caño escape, plenum motor, etc.).

Beneficio doble:
- El modelo de visión devuelve nombres canónicos en vez de inventar.
- El matcher puede filtrar por igualdad exacta sin sinónimos al query time.

### 2. Telemetría `query_log`

Collection nueva:
```js
{
  query, intent, matched_folder_ids, files_returned,
  cache_hit, total_ms, session_id, timestamp,
  // futuro: clicked_file_id, satisfaction
}
```

Sin esto, tunear prompts es a ciegas. Con 50 queries reales logueadas,
sabemos qué tipo de queries fallan y priorizamos.

### 3. Prompt vision v2

Schema nuevo:
```json
{
  "schema_version": "v2",
  "tipo_objeto": "vehiculo_completo|pieza|herramienta|documento|escena",
  "marca": "<enum marcas>",
  "modelo": "<enum modelos>",
  "sistema": "carroceria|interior|motor|tren_rodaje|electrico|escape",
  "pieza_especifica": "<enum 60-80 piezas o desconocida>",
  "vista": "frontal|lateral|trasera|tres_cuartos|cenital|detalle|despiece",
  "estado": "nueva|usada|en_proceso|terminada|desmontada",
  "color_dominante": "<enum colores>",
  "material_dominante": "<enum materiales>",
  "confianza": 0.0-1.0
}
```

`schema_version` permite re-tagear solo las viejas cuando cambia el schema.

3-4 ejemplos few-shot al final del prompt suben precisión bastante en
gpt-4o-mini.

### 4. Validación manual

Endpoint admin temporario que samplea 50 imágenes random, las taggea con
v2, y devuelve HTML con `<img>` + JSON al lado. 10 min de inspección revelan
bugs sistemáticos del prompt antes de tirar tag-all.

### 5. Tag-all 100%

Idempotente con `schema_version != "v2"`. Solo paga el costo de las que
no están al día. ~$2-4 USD si reset completo.

### 6. Nodo `match_files`

El nodo nuevo va ENTRE `match_folders` y `check_cache`:
```
parse_intent → match_folders → match_files → check_cache → ...
```

Lógica:
- Si `intent.pieza_especifica` o `intent.modelo` o `intent.color` está
  poblado → consultar `image_vision_cache` filtrando por esos campos
  (limitado a archivos cuyas carpetas matchearon en `match_folders`).
- Si devuelve >5 resultados → suficiente, saltar `search_drive`.
- Si <5 → fallback a `search_drive` actual.

Canonicalización en `parse_intent`: en vez de keywords libres, el LLM
devuelve campos estructurados que matchean el enum.

### 7. UI de validación

`GET /api/admin/vision/validate?n=50` → devuelve HTML con thumbnails +
tags JSON. Para human review post-tagging.

### 8. Polling (NO webhooks)

APScheduler en backend, cada 15 min:
- Reindex folder_tree (detecta carpetas nuevas/borradas).
- Listar archivos modificados desde `last_sync`.
- Re-taggear los nuevos.

50 líneas de código, sobrevive reinicios. Webhooks son sobreingeniería para
1-2 uploads/semana.

### 9. Auto-naming

Solo cuando los tags estén validados con uso real (>1 semana de queries
sin errores sistemáticos en `query_log`). Template:
`{tipo}_{pieza}_{sistema}_{marca}_{modelo}_{n}.{ext}`

Confianza < 0.85 → carpeta `_REVISAR/`. Bot Ordenador ya tiene la infra
(dry-run plan + execute + undo).

### 10. Embeddings (backlog)

Solo si `match_files` no resuelve queries como "auto rojo descapotable años
60". Requiere Mongo Atlas Vector Search o pgvector. Generar embedding por
descripción rica de cada imagen (1 frase en español + tags), buscar por
similitud coseno.

---

## Decisiones desestimadas

| Idea | Por qué no |
|---|---|
| Drive Push Notifications (webhooks) | Webhooks suman ops complexity (channels expiran semanal, dedup, 410 GONE, dominio verificado). Para 1-2 uploads/semana, polling es suficiente. |
| Enum de 300-500 piezas | Sobrediseño. 60-80 cubre el 90% de las queries para clásicos de alta gama. Se extiende bajo demanda. |
| YAML de sinónimos al query time | Resolver sinónimos al TAGGEAR es más limpio. El cache queda canónico y no hay query expansion. |
| Embeddings ahora | Premature optimization. Con tags estructurados + enum cerrado, el 90% de queries se resuelven sin embeddings. |
| Webhooks Drive | Ver primera fila. |

---

## Cambios al stack

| Componente | Cambio |
|---|---|
| `backend/app/taxonomy/piezas.py` | **Nuevo** — enum + helpers de canonicalización |
| `backend/app/services/vision_service.py` | Prompt v2 + schema_version |
| `backend/app/agent/prompts.py` | INTENT_SYSTEM_PROMPT: campos estructurados |
| `backend/app/agent/nodes/parse_intent.py` | Output estructurado (sin keywords libres) |
| `backend/app/agent/nodes/match_files.py` | **Nuevo nodo** |
| `backend/app/agent/graph.py` | Insertar match_files en el flow |
| `backend/app/agent/state.py` | Agregar `matched_file_ids` |
| `backend/app/routers/chat.py` | Escribir a `query_log` post-respuesta |
| `backend/app/routers/admin.py` | Endpoint `/vision/validate` HTML |
| Mongo schemas | `image_vision_cache.tags.schema_version`, collection `query_log` |

---

## Acceptance criteria por chunk

### Chunk 1-2 (foundation)
- [ ] `piezas.py` exporta 60+ piezas canónicas en al menos 5 sistemas.
- [ ] `query_log` collection escribe 1 doc por turno (verificable en Mongo).

### Chunk 3-5 (vision v2)
- [ ] `image_vision_cache` tiene `schema_version=v2` en >100 docs de prueba.
- [ ] 80%+ de las 50 imgs validadas manualmente tienen `pieza_especifica`
  != "desconocida".
- [ ] Tag-all completo, 944+ docs con v2.

### Chunk 6 (match_files)
- [ ] Query "tablero del Singer" devuelve solo imágenes con
  `pieza_especifica=tablero` (no toda la carpeta Singer).
- [ ] Suite de regresión 15/15 sigue verde.
- [ ] +10 nuevos tests cubren queries con pieza_especifica.

### Chunk 7-8 (validación + polling)
- [ ] Admin puede ver 50 thumbnails + tags en HTML.
- [ ] Subo foto al Drive → 15 min después aparece en query.

### Chunk 9-10 (naming + embeddings, futuro)
- Pendiente definir cuando llegue el momento.

---

## Referencias

- [[Funcionamiento]] — arquitectura actual.
- [[Tests_Regresion]] — suite de tests + bugs históricos.
- [[Vision_Analyzer]] — implementación v1 del tagger.
- [[Bot_Ordenador]] — infra para futuro auto-rename.
- [[Sesion_2026_05_15]] — sesión más reciente del Modo Presentación.

---

## Próxima sesión — carry-over 2026-05-15

Items concretos que quedaron afuera de la sesión 2026-05-15 y que vale la
pena retomar. Ordenado por prioridad / efectividad:

### Alta prioridad (UX directo)

0. **Cargar más fotos a las carpetas + clonar folder tree Marketing → Procesos**.
   Dos cosas pendientes del lado del contenido en Drive:
   - **Agregar más fotos** en las carpetas existentes (Marketing principalmente,
     donde hay piezas con pocos thumbs). El PreviewGrid soporta hasta 400+
     items con paginación; falta material en Drive para llenarlo.
   - **Clonar el árbol de carpetas de Marketing a Procesos** y cargar fotos
     nuevas ahí. Hoy Procesos tiene 22 carpetas que Marketing no tiene
     (Llantas, Guanteras, etc., ver item 2 de abajo) pero la simetría
     inversa también falta: Procesos necesita las piezas de Marketing
     pobladas con material de taller. Procesos sigue **off** en el bot por
     [[feedback_gerstner_procesos_off]] hasta que se pueble este árbol.

1. ~~**Telemetría real del matching de piezas**~~ ✅ **HECHO 2026-05-15**
   (commit `af3580f`). Collection `piece_match_events` (1 doc/turno:
   layer `lexical|embedding|llm|vista_wrapper|none`, matched_slug,
   candidatos embeddings, ms, window). **Próximo paso**: juntar ~1 semana
   de datos reales y de ahí armar golden set + decidir si el LLM pasa de
   "último recurso" a "validador en cada commit" (ver caveat de falsos
   positivos del léxico en [[Sesion_2026_05_15]] continuación tarde).

2. **Mirror reverso Marketing ← Procesos** (opcional).
   Hoy Procesos tiene 22 carpetas que Marketing no tiene (Llantas,
   Guanteras, Guardabarros, Bisagras de baul, Spoiler, Mecánica, etc.).
   Si querés simetría total, crear esas 22 vacías en Marketing. NO se
   borró nada en Procesos — todas conservan su contenido pre-existente.

3. **UI feedback de match incorrecto**.
   Botón discreto "❌ no era esa" sobre la slide actual. Click → marca el
   evento como wrong en `piece_match_events`. Construir labels limpios
   para regresar tests más adelante.

### Media prioridad (pulido)

4. **Golden set + script de regresión del matcher**.
   Después de tener ~50 eventos labeled (telemetría + feedback), armar un
   golden set YAML y un script que mida precision/recall. Antes de mover
   thresholds, correr este script.

5. **Revisar aliases para vocabulario rioplatense**.
   "asientos delanteros" no agarra butacas (no está como alias).
   Embedding semántico tampoco lo agarra por sesgo de "delanteros".
   Decidir: agregar `asientos` como alias de butacas, o aceptar que
   "asientos" no se use.

### Backlog del modo Chat (sin cambios)

Sigue vigente lo del bloque "Plan en 10 chunks" arriba — específicamente
los chunks pendientes:
- Chunk 7: UI admin de validación de tags (endpoint HTML).
- Chunk 9: Auto-naming via Bot Ordenador (post tags validados con uso).
- Chunk 10: Embeddings + Atlas Vector Search (solo si chunk 6 no
  alcanza). **Nota**: para el modo Presentación ya implementamos
  embeddings con `text-embedding-3-small` (ver Sesion_2026_05_15);
  podría reusarse en el modo Chat también.

### Bugs / mejoras técnicas conocidas

- **CONFIDENCE_THRESHOLD vs embeddings score**: ya fixed pero queda
  fragil. El embedding devuelve coseno (0.4-0.85) y se mapea a 0.80-0.98
  para sobrevivir al `CONFIDENCE_THRESHOLD=0.78` del router. Mejor
  diseño: que cada layer reporte un score normalizado 0-1 explícito.
- **Refresh de carpetas con >1000 hijos**: hoy se rompe (`pageSize=1000`
  sin paginar). El bug similar de 100 ya está fixed, pero si el Drive
  crece más allá de 1000 carpetas hijas de un solo nivel, hay que
  paginar también en otros llamados.

### Decisiones pendientes del usuario

- ¿Borrar las 22 carpetas extras en Procesos que NO tienen equivalente
  en Marketing? **Por ahora NO** (algunas tienen contenido), pero hay
  que decidir caso por caso si vale unificarlas con merges canónicos en
  `presentation_pieces.py` o dejarlas como piezas propias.
- ¿Sumar telemetría a Langfuse o mantener `piece_match_events` en
  Mongo? Langfuse ya está en otros bots; Mongo es lo más fácil acá.
