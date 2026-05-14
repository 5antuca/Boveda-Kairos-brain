---
tags: [gerstner-studio, drive-assistant, presentacion, reorganizacion, doc-vivo]
fecha-creacion: 2026-05-14
estado: ACTIVO — refleja Drive y backend deployados en https://ai.kairosaisolutions.com
relacionado: [[Drive_Assistant]], [[Funcionamiento]], [[Roadmap]]
commit: f3aaae7 (ai.gerstner, 2026-05-14)
---

# Reorg Drive Singer + taxonomía determinística (2026-05-14)

Sesión larga de iteración sobre **Modo Presentación**. El usuario quería:
1. Reorganizar carpetas de `gerstner ai/Porsche 964 Gerstner Singer/` para que reflejen las piezas reales del proyecto.
2. Que el bot fuera **determinístico** — saltar a una carpeta SOLO cuando se menciona literalmente, sin "inferencia" del LLM.
3. Que las carpetas vacías sean destinos válidos (no fallback silencioso al otro bucket).

Este doc captura el estado final post-reorg + nueva indexación.

---

## 🗂️ Cambios en Drive

Estructura previa al cambio: backup completo en `/root/apps/ai-gerstner/backups/drive_2026-05-13_235928.json` (132 carpetas, IDs + paths).

### Resumen numérico

| Operación | Cantidad |
|---|---|
| Carpetas creadas (en Procesos Y Marketing) | 60 + 2 (Comandos eléctricos, Apoyacabezas) |
| Carpetas trasheadas (vacías que no estaban en lista) | 19 |
| Fotos movidas a destinos canónicos | 8 |
| Carpetas preservadas con contenido (no estaban en lista pero tienen fotos) | 31 |
| Total post-reorg | Procesos: 94 · Marketing: 92 |

### Carpetas creadas — Procesos Y Marketing (mirroreadas)

Bajo `Porsche 964 Gerstner Singer/Procesos Singer/` y `Marketing y Publicidad Singer/`:

**Exterior**: Radiadores, Luneta trasera, Apertura de puerta, Marco de vidrios, Marcos de parlantes y tweeter, Marcos de comando de puertas, Intermitentes, Intermitentes traseros, Spoiler acrílico y grilla metálica, Capot perforado, Zócalos exteriores, Faldones de paragolpes, Manija de puertas externa, Bisagra de aluminio de capot, Tapa de baúl, Rejilla de paragolpe delantero, Adhesivos laterales, Burletes de paragolpes, Techo corredizo, Cerradura de tapa de baúl, Modificación de puertas, Embellecedores de zócalo, Panel estructural frontal.

**Interior**: Guantera, Interiores, Pedaleras, Instrumental, Burletes, Comandos de volante, Volante Prototype, Palanca de cambios, Climatizador dashboard, Difusores de aire internos, Encausadores de aire, Tapa de combustible y tapa de oil, Comandos de butaca, Comandos eléctricos, Apoyacabezas, Comandos manuales de butacas.

**Motor / mecánica**: Manguera de aire acondicionado, Cañería de aire acondicionado, Cañería de aceite, Soportes de laterales traseros, Cobertor de escape, Salidas de escape dobles, Aislación de escape, Sunchos y tanque de combustible, Fusilera, Torretas delanteras de suspensión regulable, Amortiguadores Hollings, Rebuild de motor caja y diferencial, Garganta de combustible, Tapizado motor, Pintura de piezas de motor, Piezas y accesorios de motor, Bulonería, Válvulas de neumáticos, Frenos delanteros, Regulador de presión del freno ABS.

**Procesos generales**: Extracción de laterales traseros, Reemplazo de guardabarro de fibra de carbono, Pintura de carrocería, Desarme completo.

### Carpetas trasheadas (19)

Solo se trashearon las **vacías** que no estaban en la lista. El script verifica con Drive directo (no cache) antes de trashear — **salvó >300 fotos** de orphans donde el cache decía "0 archivos" pero Drive sí tenía contenido.

Ejemplos: `Bisagras de capot`, `Cinturones de seguridad`, `Insignia de capot Porsche`, `Inyeccion del motor`, `Marco de radio y difusores`, `Opticas delanteras Vidrios`, `Salida doble de escape cerakote`, `Tapizado de baul` (vacíos de Procesos), `Capot`, `Apoya pies`, `anodizados de puertas` (Marketing tras mover su contenido).

### Carpetas preservadas (31, con contenido)

NO se trashearon porque tienen fotos. Ejemplos importantes con cantidad de archivos:

| Carpeta | Fotos |
|---|---|
| Procesos/Guanteras | 121 |
| Procesos/Spoiler | 49 |
| Marketing/Tanque de combustible | 36 |
| Marketing/Motor Singer | 23 |
| Marketing/Cueros y diseño interior | 22 |
| Marketing/Tapizado de baul | 18 |
| Marketing/Plenum del motor | 16 |
| Marketing/Spoiler y componentes | 14 |
| Procesos/Tanque de combustible | 14 |
| Marketing/Guanteras de puertas | 11 |
| Marketing/Tapas oil y fuel | 11 |
| Procesos/Pedaleras y piezas de apertura | 11 |
| Procesos/Spoiler Rejilla | 10 |

Pendiente: el usuario puede decidir más adelante qué hacer con éstas (mover contenido a las nuevas canónicas, mantener, etc.).

### Movimientos de fotos (8 archivos)

- `Bisagras de baul y capot/` → **Bisagra de aluminio de capot** (5 archivos), source trasheado.
- `Capot/` → **Capot perforado** (2 archivos), source trasheado.
- `Apoya pies/` → **Pedaleras** (1 archivo), source trasheado.

---

## 🧠 Cambios de indexación / taxonomía

### Filosofía nueva: folder-as-piece (determinístico)

**Antes** (taxonomía con merges):
- 35-50 canonicals, cada uno consolidando varias carpetas similares (ej. canonical `puertas` agrupaba `puerta_exterior`, `apertura_puerta`, `modificacion_puertas`).
- LLM extractor (gpt-4.1-mini) corría como fallback cuando `fast_match` no encontraba nada → inferencia semántica creativa.

**Resultado problemático**:
- "Apertura interior de puerta" → mergeada a "puertas" → mostraba contenido genérico.
- "Ahí va" (sin contexto) → LLM inferia "apertura_puerta" → slide saltaba a esa carpeta.
- Tos / ruido → LLM extractor re-matcheaba piezas viejas del transcript window.

**Ahora** (`presentation_pieces.py`, decisión 2026-05-14):
- **106 piezas en piezas_list**, una por carpeta del Drive.
- Merges SOLO para sinónimos puros donde el usuario los usa intercambiablemente:
  - `faros` ← faros, ópticas, faros y guiños, opticas_delanteras_vidrios
  - `llantas` ← llantas, ruedas, ruedas_llantas
  - `motor` ← motor, plenum, plenum_motor, inyeccion_motor (confirmado: "el plenum es el motor")
  - `tapas_liquidos` ← tapas_oil_fuel, tapa_combustible_tapa_oil
  - `pedaleras` ← pedaleras, apoya_pies, apoyapies
  - `guanteras` ← guanteras, guantera, guanteras_puertas
- **Carpetas vacías cuentan** — `presentation_warmup.build_piezas_map()` ya NO filtra carpetas sin contenido. Si nombrás "Luneta trasera" (vacía), va a esa carpeta y muestra empty state.
- **LLM extractor DESACTIVADO** — `piece_extractor.extract()` ahora solo usa `fast_match_piece` literal. Si no hay match, no se emite nada. La slide se queda.

### fast_match — algoritmo nuevo (`presentation_pieces.fast_match_piece`)

1. **Scope a últimas 25 palabras** del transcript_window — no escanea historia vieja. Esto evita el bug "vuelve a la primera pieza ante tos/ruido".
2. **Score por (end_position, alias_length)** — prefiere lo último mencionado, y en empate de fin prefiere el alias más LARGO/específico.
   - "Apertura de puerta interior" → `apertura_puerta` (no `puertas`).
   - "Comandos de butaca" → `comandos_butaca` (no `butacas`).
   - "Espárragos de masas de rueda" → `esparragos_masas_rueda_tuercas` (no `llantas`).
3. Sin LLM fallback. Si no matchea, retorna (None, 0.0) y el slide queda quieto.

### SPEECH_ALIASES (~127 entradas)

Cada folder slug tiene sus propios aliases de voz. Aliases peligrosamente cortos eliminados:
- ❌ `palanca` solo, `pomo` solo (ambiguos)
- ❌ `abs`, `ac`, `valvulas` solo (matcheaba palabras random)
- ❌ `hollings` solo (poco específico)
- ✅ Frases completas: "palanca de cambios", "pomo de marchas", "freno abs", "manguera de aire acondicionado".

### Grupos temáticos (`THEMATIC_GROUPS`)

Reorganizados para reflejar siblings reales. Grupo nuevo importante:
```python
"butacas_grupo": [
    "butacas", "comandos_butaca", "comandos_manuales_butacas",
    "comandos_electricos", "apoyacabezas",
]
```
Cuando la slide muestra `comandos_butaca`, el navbar de relacionadas muestra estos como "siblings" → como pidió el usuario explícitamente.

Otros grupos clave:
- `puertas_grupo`: puertas, apertura_puerta, modificacion_puertas, paneles_puerta, tapizado_puertas, anodizados_puertas, manijas (4 variantes).
- `paragolpes_grupo`: paragolpes y todas sus variantes (delantero, trasero, faldones, rejilla, burletes).
- `motor_y_mecanica`: motor, escape (3 variantes), tapas líquidos, tanque, garganta, radiadores, A/C, fusilera, bulonería, mecánica, rebuild.
- `vidrios_y_espejos`: parabrisas, luneta_trasera, marco_vidrios, 4 variantes de espejos retrovisores, burletes.

### Audio (whisper-1, no cambió desde sesión anterior)

Mantenemos lo que funcionó en la iteración previa:
- **Modelo STT**: `whisper-1` con `language: "es"`.
- **Prompt de bias** en formato glosario comma-separated (sin oraciones declarativas para evitar prompt-bleed).
- **VAD**: `server_vad`, threshold 0.6, prefix 300ms, silencio 500ms.
- **Filtro de alucinaciones** en `realtime_proxy._is_hallucination()` — descarta finales como "Subtítulos por Amara", "Gracias por ver", "...", solo símbolos, ≤2 chars.

---

## 🎨 UI Modo Presentación (estado final)

- **Controles minimal**: solo ▶/⏸ (pausa) + 🔍 (lupa búsqueda). Sin botón de salir — para salir, browser back.
- **Slide single-column 4×2** (mobile: 2×4 vertical). Hasta 8 thumbs, el último slot es "+N" si overflow.
- **Header con badge** bucket: **Procesos** (amarillo) o **Marketing** (celeste).
- **Bucket por voz**: "procesos motor" → procesos. Solo "motor" → marketing. Heurística: si "procesos"/"proceso" aparece en los últimos ~40 chars del window, bucket=procesos.
- **Sin fallback de bucket vacío**: si pedís procesos y está vacío, muestra empty state, NO te tira marketing.
- **Picker de búsqueda manual (🔍)**: modal con input + grid de todas las piezas, filtro por nombre. Manual jump → siempre marketing.

---

## 🚧 Pendiente / próximos pasos

- **Subir fotos a las 60 carpetas nuevas vacías** — ahora aparecen en piezas_list igual, pero muestran empty state. Cuando se carga material van a aparecer con contenido automáticamente.
- **Decidir qué hacer con las 31 preservadas** — algunas se podrían consolidar (ej. mover fotos de `Marketing/Tanque de combustible` a `Marketing/Sunchos y tanque de combustible` si esa es la canónica nueva).
- **Detectar carpetas nuevas automáticamente** — el `drive_sync_job` ya corre cada 15 min y refresca `folder_tree`. Las nuevas piezas aparecen al siguiente `/presentation/start`.

---

## 📁 Archivos modificados

Repo `5antuca/ai.gerstner` — commit `f3aaae7`:

```
backend/app/services/presentation_pieces.py    # CANONICAL_PIECES + SPEECH_ALIASES + THEMATIC_GROUPS
backend/app/services/presentation_warmup.py     # no filtra carpetas vacías
backend/app/services/piece_extractor.py         # LLM fallback OFF
backend/app/services/realtime_proxy.py          # whisper-1 + glosario + filtro alucinaciones
backend/app/routers/presentation.py             # bucket detection + debug prints
backend/scripts/drive_reorg.py                  # script idempotente del reorg
frontend/src/components/PresentationSlide.jsx   # single-column, no fallback bucket
frontend/src/components/PresentationControls.jsx  # solo play/pause + lupa
frontend/src/components/PiecePicker.jsx         # modal de búsqueda manual
frontend/src/pages/Presentation.jsx             # wiring del bucket + picker
frontend/src/styles.css                         # grid 4x2 + piece picker styles
```

Backup pre-reorg (no commiteado, vive en VPS):
```
/root/apps/ai-gerstner/backups/drive_2026-05-13_235928.json
```
