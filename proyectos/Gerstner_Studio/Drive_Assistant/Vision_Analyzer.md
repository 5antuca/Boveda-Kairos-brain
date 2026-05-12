---
tags: [gerstner-studio, drive-assistant, vision, llm, openai]
fecha-creacion: 2026-05-10
estado: ACTIVO — desplegado el 2026-05-10 (Fases 1-3)
relacionado: [[Drive_Assistant]], [[Metricas_Latencia]]
---

# Vision Analyzer — implementación

Capa que analiza visualmente las imágenes de Drive con OpenAI gpt-4o-mini
y guarda tags estructurados (color, parte_visible, fase, material, etc) para
que el bot pueda responder queries del estilo "tablero shelby cobra",
"jaguar amarillo", "asientos cuero" — donde la respuesta NO está en el
nombre de la carpeta sino en el contenido de las fotos.

Approach C híbrido (pre-tag liviano de 5 muestras por carpeta + on-demand
para queries con filtros raros). Este doc cubre la **implementación deployada**.

---

## Las 3 fases

### Fase 1 — `vision_service.analyze_image(file_id)`

`bot-service/app/services/vision_service.py`. Función bajo nivel que recibe
un `file_id` de Drive, baja el thumbnail (=s400), lo pasa a OpenAI vision
con el prompt `TAG_SYSTEM_PROMPT` y devuelve un dict con tags. Cache en
`image_vision_cache` de Mongo (sin TTL — invalidación manual o por mtime
del indexer cuando exista).

**Schema del output** (todos los campos siempre presentes):

```json
{
  "color_dominante": "amarillo|azul|rojo|...|otro|ninguno",
  "carroceria": "coupe|sedan|wagon|cabriolet|roadster|suv|pickup|barco|moto|otro|ninguno",
  "fase": "sin_pintar|chapa|pintado|terminado|en_chasis|interior|motor_visible|otro|ninguno",
  "parte_visible": ["interior", "tablero", "palanca", ...],
  "material_dominante": "cuero|tela|alcantara|vinilo|metal|madera|fibra|otro|ninguno",
  "tags_libres": ["palabras clave en minúsculas, máximo 4"]
}
```

### Fase 2 — Tagger offline

Dos funciones públicas en `vision_service.py`:

- `tag_folder(folder_id, n_samples=5)` — samplea hasta `n_samples` imágenes
  de la carpeta (de `folder_cache` si existe, o Drive directo). Si la carpeta
  es contenedora (sin archivos directos), baja 1 nivel automáticamente.
  Analiza cada imagen, agrega un `vision_summary` a la carpeta con los
  valores predominantes.

- `tag_all_folders(n_samples=5, only_missing=True)` — itera todo el folder_tree.
  Idempotente con `only_missing=True`: skipea las que ya tienen `vision_summary`.

El `vision_summary` es un resumen agregado de los N tags individuales:

```json
{
  "colors": ["marron", "naranja"],          // top 3
  "carrocerias": ["coupe"],                  // top 2
  "fases": ["interior"],                     // top 2
  "materials": ["cuero"],                    // top 2
  "parts": ["interior", "tablero", ...],    // top 5
  "tags_libres": ["palanca de cambios", ...] // top 5
}
```

### Fase 3 — Integración en el matcher

Dos cambios en el grafo:

1. `prompts.py:INTENT_SYSTEM_PROMPT` — agrega un campo `visual_filter` al
   schema de salida de `parse_intent`. Solo lo poblamos cuando el query
   describe algo que requiere ver la imagen (ej. "tablero", "amarillo",
   "asientos cuero"). En queries genéricas o por nombre de proyecto, queda
   `null` y el flujo es el de siempre.

2. `match_folders.py` — si `intent.visual_filter` está presente, calcula un
   `_score_visual` por cada candidato comparando contra `vision_summary`:
   - matches en `parts` o `colors` → +15 puntos
   - matches en `materials`, `fases`, `carrocerias`, `tags_libres` → +8
   Las que tienen score visual > 0 suben al top y entran al LLM final, que
   ve el contexto `vision` de cada candidato y decide.

Ejemplo: query **"tablero shelby cobra"** →
- `parse_intent`: `{"project": "shelby cobra", "visual_filter": "tablero"}`
- `match_folders` prefilter: candidatos = todas las carpetas con "shelby" o "cobra" en path
- Re-score visual: las que tienen `vision_summary.parts` con "tablero" suben
- LLM elige las 1-3 mejores

Si NINGUNA carpeta del proyecto tiene `vision_summary` (todavía no taggeada),
el flujo cae al matching por path normal — no es regresión.

---

## Endpoints admin

Todos requieren `Authorization: Bearer <ADMIN_TOKEN>`.

```bash
# Tagear UNA imagen puntual (smoke test)
POST /api/admin/vision/analyze/{file_id}?force=false

# Tagear UNA carpeta (~$0.005-0.01)
POST /api/admin/vision/tag-folder/{folder_id}?n_samples=5

# Tagear TODAS las carpetas (background, ~$1-3 USD según cantidad)
POST /api/admin/vision/tag-all?n_samples=5&only_missing=true
# Devuelve { "status": "started_in_background" } inmediatamente.
# Progreso: docker logs -f ai-gerstner-backend | grep vision-tagger

# Limpiar todo (cache + summaries)
DELETE /api/admin/vision
```

### Reindex selectivo

Cuando agregás contenido nuevo al Drive sin querer reindexar todo:

```bash
POST /api/admin/refresh-folder/{folder_id}?retag_vision=false
```

Lista las hijas de esa carpeta en Drive, las upserta en `folder_tree`, e
invalida `folder_cache` de la rama. Si `retag_vision=true`, además limpia
los `vision_summary` afectados (después correr `/admin/vision/tag-all`
para re-tagger las pendientes — idempotente con `only_missing=true`).

---

## Estructura en MongoDB

Tres colecciones / extensiones:

| Colección | Cambio | Contenido |
|---|---|---|
| `folder_tree` | Campos nuevos | `vision_summary`, `vision_tagged_at`, `vision_samples_count` |
| `image_vision_cache` | Nueva | `{file_id, tags, model, analyzed_at}`, índice unique en `file_id` |

`image_vision_cache` no tiene TTL — los tags son estables hasta que la imagen
cambie. La invalidación la hace `/admin/vision` (full reset) o
`/admin/refresh-folder/{id}?retag_vision=true` (selectivo).

---

## Costos observados

| Operación | Costo |
|---|---|
| `analyze_image` (1 thumbnail =s400, ~30KB) | ~$0.001-0.002 USD |
| `tag-folder` (5 samples) | ~$0.005-0.01 USD |
| `tag-all` (140 carpetas × 5 samples) | ~$1.50-3 USD |

Si el costo escala mal, opciones:
- Bajar `n_samples` a 3 (~40% menos).
- Bajar tamaño thumbnail a `=s256` (cae detalle pero alcanza para color/parte).
- Cambiar a `gpt-4.1-mini` con vision (si confirmamos que soporta).

---

## Validar con queries

Después de un `tag-all` completo, queries que deberían funcionar mejor:

| Query | Cómo decide ahora |
|---|---|
| "tablero shelby cobra" | `vision_summary.parts` ⊇ ["tablero"] en alguna carpeta Cobra |
| "asientos cuero singer" | `vision_summary.materials` ⊇ ["cuero"] + `parts` ⊇ ["asientos"] |
| "jaguar amarillo" | `vision_summary.colors` ⊇ ["amarillo"] en carpetas Jaguar |
| "motor sin pintar" | `vision_summary.fases` ⊇ ["sin_pintar"] + `parts` ⊇ ["motor"] |

Para inspeccionar qué se taggeó en una carpeta:

```bash
docker exec ai-gerstner-mongo mongosh gerstner_drive --quiet --eval '
db.folder_tree.findOne(
  {path: /Shelby Cobra/i},
  {_id:0, path:1, vision_summary:1, vision_samples_count:1}
)'
```

---

## Limitaciones conocidas

- **Sample sesgado**: si la carpeta tiene 100 fotos y las 5 muestreadas son
  similares, el `vision_summary` no refleja la diversidad real. Mitigado
  parcialmente porque Drive devuelve archivos en orden de creación; cuando
  haya filtros más finos vale la pena samplear distribuido.
- **gpt-4o-mini puede alucinar tags libres** — los campos enum (color, fase, etc)
  son seguros porque están restringidos por el prompt; `tags_libres` es
  open-ended y a veces inventa palabras tipo "diseño elegante". El matching
  por substring es tolerante.
- **`force=false` lee siempre del cache** — si re-tagueás con `only_missing=true`
  no se recalcula. Para forzar, llamar con `force=true` en analyze_image
  individual o resetear la carpeta vía `/admin/refresh-folder?retag_vision=true`.
- **No hay invalidación automática por mtime de Drive** — depende del
  spec [[Spec_Auto_Sync_Drive]] que todavía no está implementado.

---

## Estado

- **2026-05-10**: Fases 1-3 deployadas y probadas con foto de butacas Singer
  (resultado correcto: marron / interior / cuero / tablero+palanca+asientos).
  Tag-all sobre 140 carpetas de la copia del Drive lanzado en background.
- **Próximos pasos sugeridos**:
  1. Validar queries golden post tag-all completo.
  2. On-demand sampling como fallback: cuando ninguna carpeta del proyecto
     tiene match visual, samplear en vivo. Pendiente.
  3. Cron de invalidación por mtime cuando exista [[Spec_Auto_Sync_Drive]].
