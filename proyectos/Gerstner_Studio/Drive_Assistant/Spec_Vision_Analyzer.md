---
tags: [gerstner-studio, drive-assistant, spec, vision, mejora]
fecha: 2026-05-09
estado: APROBADO — approach C ratificado el 2026-05-09, pendiente implementación
relacionado: [[Drive_Assistant]], [[Spec_Fix_Matching_y_Cache]], [[Decisiones_Pendientes]]
---

# Spec — Analizador de visión para filtros por contenido

## El problema

Los nombres de archivo de Drive son hashes (`3052lOjR-Zf0Ppj2.jpg`). El bot
no puede distinguir contenido por filename. Hoy:

| Query | Lo que hace | Lo que debería hacer |
|---|---|---|
| "guantera singer" | Devuelve todas las imgs de Singer (incluye guanteras + ruedas + interior) | Devolver solo las que muestren guanteras |
| "jaguar amarillo" | Devuelve Jaguar E-Type (azul, no hay carpeta "amarillo") | Devolver el Jaguar amarillo si existe en algún folder |
| "Singer rojo cuero" | Devuelve Singer (cualquier color/tapizado) | Filtrar por rojo + cuero |

El usuario detectó este gap pidiendo "fotos del jaguar amarillo" y obteniendo
fotos de Jaguar **azul**. Esperable: **el bot no ve las imágenes**, solo paths
y filenames.

## Solución — analizador de visión

Una capa que **mira efectivamente las imágenes** y genera tags estructurados
(color, carrocería, partes visibles, fase de proceso) que después se usan
como filtros en el match.

---

## Tres approaches con tradeoffs

### A) Pre-index offline — todas las imágenes etiquetadas una vez

**Cómo**: un cron job recorre todas las imágenes del Drive (hoy ~miles), llama
a un vision model por cada una, guarda tags en MongoDB.

```
imagen.jpg → vision API → { color: "azul", vehicle: "jaguar e-type",
                             part: "exterior_lateral", tags: ["clasico", "60s"] }
                                  ↓
                      MongoDB image_tags collection
```

En query time, `match_folders` y `generate_response` filtran por tags exactos
(latencia adicional: 0).

**Costos**:
- Inicial: N imágenes × $0.001-0.005 = ~$10-50 USD para todo el Drive (estimado).
- Mantenimiento: cron diario que tagea solo las nuevas. Marginal (~$0.50/día).

**Pros**:
- ✅ Latencia query: cero overhead.
- ✅ Consistente — mismas imágenes siempre tienen mismos tags.
- ✅ Soporta filtros precisos ("amarillo + interior + cuero").

**Contras**:
- ❌ Inversión inicial fuerte (corre 1-2 horas el primer batch).
- ❌ Tags son fijos al momento de indexar — si un día querés filtrar por algo
  no contemplado (ej. "patente"), hay que re-tag.
- ❌ MongoDB crece (~1KB/imagen × miles de imgs = ~5-10 MB extra, manejable).

---

### B) On-demand sampling — visión solo cuando hace falta

**Cómo**: en query con keywords visuales (color, parte específica), tomar 3-5
imágenes muestra de cada folder candidato y analizarlas en vivo.

```
query "jaguar amarillo"
   ↓
match_folders → 3 candidatos
   ↓
   por cada folder: tomar 3 muestras → vision API
   ↓
   ¿alguna muestra es amarilla?
   ↓
   sí → ese folder gana
   no → siguiente
```

**Costos**:
- Por query con vision: 3-5 calls × $0.001-0.005 = ~$0.003-0.025/query.
- A 50 queries/día con vision = ~$0.15-1.25/mes. Despreciable.

**Pros**:
- ✅ Sin inversión inicial.
- ✅ Más flexible — puede responder cualquier pregunta visual sin pre-tagging.
- ✅ Solo paga cuando el user lo necesita.

**Contras**:
- ❌ Latencia +2-5s en queries con vision.
- ❌ Si el folder tiene 100 fotos y el amarillo está en la posición 87, las
  3 muestras pueden no atraparlo (sampling sesgado).
- ❌ Inconsistente — corridas distintas pueden picar muestras distintas.

---

### C) Híbrido — pre-tag de proyectos top + on-demand para queries específicas

**Cómo**:
1. Pre-tag offline solo los folders con >50 imgs (los más usados).
2. Para queries que matchean folders pre-tageados → filtro instantáneo.
3. Para queries con keywords visuales que NO están en los tags pre-computados
   → on-demand sampling como en B.

**Costos**:
- Inicial: ~10-30 folders × 50 imgs × $0.001 = ~$0.50-1.50 USD.
- Por query con vision adicional: igual a B.

**Pros**:
- ✅ Bajo costo inicial.
- ✅ Latencia 0 para queries comunes (proyectos top).
- ✅ Cobertura total via on-demand para casos raros.

**Contras**:
- ❌ Más complejidad de código (dos paths de filtrado).

---

## Recomendación

**~~B (on-demand) para v1~~** → **C (híbrido) ratificado el 2026-05-09**.

Cambio de criterio: el usuario pidió explícitamente "que pueda reconocer
**hasta algunas imágenes de todas las carpetas** para que al menos le pueda
mencionar cosas por colores". Eso es approach C: pre-tag liviano (3-5
muestras por carpeta) + on-demand para casos no cubiertos.

Razones para C sobre B:

1. **Cobertura mínima garantizada**: cualquier carpeta tiene tags de color
   básicos. Query "amarillo" puede filtrar el árbol entero sin disparar
   vision API en cada carpeta.
2. **Latencia query: 0** para colores/materiales comunes (todo precomputado).
3. **Costo inicial bajo**: ~400 carpetas × 5 muestras × $0.0015 = ~$3 USD.
   Mantenimiento: marginal (solo carpetas nuevas vía cron).
4. **On-demand sigue disponible**: si el query pide algo no cubierto por
   los tags pre-computados (ej. "patente XYZ-123"), cae al sampling de B.

Razones para descartar B puro:

- B requería disparar vision API en cada query con filtro visual → +2-5s
  por query y costo proporcional al uso.
- B no garantiza cobertura: el sampling random podía perder el item buscado.

---

## Diseño técnico de B (on-demand)

### Provider de visión: OpenAI gpt-4o-mini

- Soporta imágenes vía data URL o URL pública.
- Costo: ~$0.001-0.003 por imagen analizada (depende de tamaño).
- Latencia: ~600ms-1.5s por imagen.
- Ya tenemos la `OPENAI_API_KEY` configurada.

Alternativas:
- Google Vision API (Vision Cloud): mejor para object detection, peor para
  tags semánticos. Más barato (~$0.0015/img).
- Cloudflare Workers AI (LLaVA): gratis pero menos preciso para autos clásicos.

**Ganador**: OpenAI gpt-4o-mini por integración + flexibilidad de prompts.

### Cuándo activar el analizador

En `parse_intent`, agregar campo:
```json
"visual_filter": "yellow car" | "leather interior" | null
```

El LLM detecta si la query contiene un filtro que requiere ver la imagen
(color, material, pieza específica). Si es null → flujo normal sin vision.

Heurística complementaria (regex defensivo):
- Colores: amarillo, azul, rojo, verde, blanco, negro, plata, dorado, naranja...
- Materiales: cuero, tela, alcántara, vinilo
- Estados: pintado, sin pintar, oxidado, en chasis, terminado
- Detalles específicos: rines, llantas, faros, parrilla, escape

### Pipeline en match_folders

```python
async def match_folders(state):
    if state.get("matched_folder_ids"):
        return state

    folders = await db.folder_tree.find(...).to_list(...)
    candidates = prefilter(folders, intent)  # ya existe

    if not intent.get("visual_filter"):
        # Path normal — LLM elige por path
        return llm_pick(candidates)

    # Path con visión — para cada candidato, ver 3 imgs y validar
    folder_scores = []
    for folder in candidates[:5]:  # top 5 candidatos
        sample_files = await drive_service.sample_images(folder.id, n=3)
        match_score = await vision.check_match(
            files=sample_files,
            visual_filter=intent["visual_filter"]
        )
        folder_scores.append((match_score, folder))

    # Ordenar por score, devolver top 3
    folder_scores.sort(reverse=True)
    return [f.id for _, f in folder_scores[:3]]
```

### Vision check function

```python
async def check_match(files, visual_filter):
    # Bajar 3 thumbnails =s400 de Drive (rápido, ya tenemos cache)
    images_b64 = [await fetch_thumbnail_b64(f.id) for f in files]

    # Una sola llamada con las 3 imágenes
    response = await openai_vision.chat([
        {"role": "system", "content": "..."},
        {"role": "user", "content": [
            {"type": "text", "text": f"¿Alguna muestra '{visual_filter}'? JSON: {{\"match\": true|false, \"confidence\": 0..1}}"},
            *[{"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}} for b64 in images_b64]
        ]}
    ])

    return parse_score(response)
```

### Coste por query

- 3 thumbnails × ~30KB cada uno (=s400) → 90KB de imagen al modelo.
- 1 prompt + respuesta JSON.
- Latencia: ~1.5-3s por folder candidato. Si paralelizamos 5 candidatos: 1.5-3s total.
- Costo: ~5 × ($0.0015/img × 3 imgs + $0.0001/prompt) = ~$0.025/query con vision.

A 30 queries de visión/día × 30 días = $22/mes. Asumible. Si baja queries, baja proporcional.

### Cache de resultados de visión

Para evitar re-analizar la misma imagen N veces:
- MongoDB collection `image_vision_cache`:
  ```js
  { file_id, color, vehicle_features, last_analyzed }
  ```
- TTL 30 días.
- Si una imagen ya fue analizada, reusar tags sin llamar vision API.

Esto convierte un sistema "B puro" en un "B con cache progresivo" — efectivamente
se acerca a A con el tiempo, sin la inversión inicial.

---

## Plan de ejecución

### Fase 1 — vision module básico (~2h)
- Crear `bot-service/app/services/vision_service.py`.
- Función `analyze_images(file_ids, prompt) -> {match: bool, ...}`.
- Cache en `image_vision_cache` Mongo.

### Fase 2 — integrar en match_folders (~1h)
- Detectar `visual_filter` en parse_intent prompt.
- Branch en match_folders: si visual_filter, usar vision para rerank candidates.

### Fase 3 — refinamiento (~1h)
- Tunear prompts (qué tags genera el modelo, formato de respuesta).
- Tests con queries reales: "amarillo", "interior cuero", "sin pintar".
- Ajustar n_samples (3 vs 5) según calidad.

**Total**: ~4-5 horas. Reversible (feature flag `ENABLE_VISION_FILTER`).

---

## Decisiones tomadas (2026-05-09)

| # | Pregunta | Resolución |
|---|---|---|
| V1 | ¿Approach A, B, o C? | **C (híbrido)**: pre-tag de 5 muestras por carpeta + on-demand para queries con filtros raros. Trigger: pedido explícito del usuario de cobertura sobre todas las carpetas. |
| V2 | ¿Activar siempre que haya color, o toggle UI? | **Siempre que `parse_intent` detecte `visual_filter` no nulo**. Sin toggle UI — debe ser transparente al user. |
| V3 | ¿OpenAI vision o Google Vision? | **OpenAI gpt-4o-mini**. Consistencia con el resto del stack + flexibilidad de prompts en español. |
| V4 | ¿Cuántas muestras por folder? | **5** para el pre-tag offline (cubre la diversidad típica de una carpeta de proyecto). On-demand: 3 (más rápido). |
| V5 | ¿TTL del cache de visión? | **Sin TTL — invalidación por mtime**. Cuando el indexer detecta que una carpeta cambió (ver [[Spec_Auto_Sync_Drive]]), borra los tags de visión asociados a esa carpeta y los re-genera en la próxima corrida del tagger. |

### Plan de tagger offline (approach C)

Cron job nuevo (puede vivir junto al de [[Spec_Auto_Sync_Drive]]) que:

1. Lista carpetas en `folder_tree` que no tengan entradas correspondientes
   en `image_vision_cache`.
2. Por cada carpeta, samplea hasta 5 archivos de imagen.
3. Llama a OpenAI vision con prompt de tagging estructurado:
   ```
   { "color_dominante": "amarillo|azul|rojo|...",
     "carroceria": "coupé|sedán|wagon|...",
     "fase": "sin pintar|pintado|terminado|en chasis|...",
     "tags_libres": ["..."] }
   ```
4. Guarda por archivo en `image_vision_cache` + agrega a la carpeta un
   `vision_summary` con los colores/carrocerías predominantes.
5. En `match_folders`, si `intent.visual_filter` matchea contra
   `folder.vision_summary` → score boost. Si no hay match en summary →
   on-demand sampling (path B) sobre los top 3 candidatos.

Costo inicial: ~400 carpetas × 5 imgs × $0.0015 = ~$3 USD.
Mantenimiento: solo carpetas nuevas o invalidadas → ~$0.10/mes.

---

## Estado

- **2026-05-09**: spec escrito. Trigger inicial: usuario detectó que "jaguar
  amarillo" devolvía azul (porque no hay carpeta "amarillo" y los filenames
  son hashes).
- **2026-05-09 (mismo día)**: ratificado approach **C** (pre-tag liviano +
  on-demand). Trigger: pedido explícito del usuario de cobertura sobre todas
  las carpetas para poder mencionar cosas por colores. V1-V5 cerradas.
  Implementación pendiente — depende de [[Spec_Auto_Sync_Drive]] para el
  cron de invalidación por mtime.
