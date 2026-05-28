---
tags: [gerstner-studio, configurador-911, optimizacion, 3d, en-progreso]
fecha-inicio: 2026-05-28
estado: EN PROGRESO - falta TurboSmooth en body + re-export v5
---

# Optimización 3D del Porsche Singer — Sesión 2026-05-28

> [!abstract] Objetivo
> Optimizar el modelo `Porsche_Gerstner_PRUEBA.glb` (entrega 1 del artista 3D) para integrarlo al configurador web. Partida: 268 MB, ~3M tris, 83 materiales, sin Draco/KTX2.

Relacionado: [[README]] · [[ROADMAP_Modelo_Singer_3D]] · [[Spec_PorscheSinger_GLB.pdf]] · [[Feedback_Entrega1_PorscheSinger.pdf]]

---

## Estado al cierre de sesión (interrumpido por crash de VSCode)

### En 3ds Max (PC del artista)
- Archivo Max guardado con optimizaciones ya aplicadas (ProOptimizer + Smooth modifier en exterior).
- **Último countTotalTris reportado**: ~2.87M tris (bajamos de 7.68M iniciales en Max).
- **Smooth modifier aplicado** a 207 piezas del exterior con `autosmooth=true, threshold=180`. Pero **NO ALCANZÓ** — el usuario sigue viendo triángulos visibles en los guardabarros traseros del Singer.
- **Próximo paso PENDIENTE**: aplicar **TurboSmooth iter=1** a las piezas dentro de `Exterior_body → Body` para agregar polys reales en el body.

### En VPS (/root/)
Archivos generados durante la sesión:
- `Porsche_v2.glb` — 102 MB (export original de Max después de primera ronda de ProOptimizer)
- `Porsche_v2_RAW.glb` — 61 MB (v2 sin Draco, solo WebP)
- `Porsche_v2_draco_hi.glb` — 11 MB (Draco 14-bit normales)
- `Porsche_v2_smooth.glb` — 15 MB (meshopt en vez de Draco)
- `Porsche_v2_clean.glb` — 9 MB (Draco default + WebP)
- `Porsche_v2_final.glb` — 4.4 MB (optimize completo con palette+simplify, materiales colapsados)
- `Porsche_v4.glb` — 99 MB (export después de aplicar Smooth modifier en Max)
- `Porsche_v4_RAW.glb` — 61 MB (v4 sin Draco)
- `Porsche_v4_HIQ.glb` — 13 MB (v4 con Draco 16-bit, máxima calidad posible)

### Diagnóstico de los fenders (confirmado)
- Comparamos `Porsche_v4_RAW.glb` (cero compresión) vs `Porsche_v4_HIQ.glb` (Draco 16-bit) — **ambos muestran las mismas facetas en los fenders**. 
- **Conclusión**: el problema NO es Draco ni la compresión. Es **falta de polys en los body planes** (Smooth modifier no agrega polys, solo arregla shading).
- Solución: TurboSmooth en Max para agregar polys reales en los planes del body.

---

## Plan para retomar (al reiniciar VSCode)

### 1. Abrir Max y aplicar TurboSmooth al body

En Scene Explorer (`H`):
1. Click en zona vacía → deselecciona todo.
2. Expandir `911 → Exterior_body → Body`.
3. Click derecho sobre `Body` → **Select Subtree** o **Select Children**.
4. Confirmar "X Objects Selected" en esquina inf-izq.

En MAXScript Listener:
```maxscript
for o in selection do (local m = TurboSmooth(); addModifier o m; m.iterations = 1; collapseStack o)
```

Esperado: tris suben de 2.87M a ~3.5-4M. Orbitar viewport — los fenders deben verse smooth.

### 2. Re-exportar desde Max

`File → Export → Porsche_v5.glb` con:
- Format: glb (binary)
- Materiales: **Originals**
- Triangulate: ✅
- Smoothing Groups: ✅

### 3. Subir al VPS

```bash
scp "/Users/5an/Downloads/Porsche_Gerstner_PRUEBA (4).glb" root@46.62.235.162:/root/Porsche_v5.glb
```

### 4. Procesar en VPS

Para validar sin compresión:
```bash
npx -y @gltf-transform/cli optimize /root/Porsche_v5.glb /root/Porsche_v5_RAW.glb \
  --compress false --texture-compress webp --simplify false --palette false \
  --texture-size 4096 --join false
```

Para versión final (Draco 14-bit normales):
```bash
npx -y @gltf-transform/cli optimize /root/Porsche_v5.glb /tmp/step1.glb \
  --compress false --texture-compress webp --simplify false --palette false \
  --texture-size 4096 --join false

npx -y @gltf-transform/cli draco /tmp/step1.glb /root/Porsche_v5_FINAL.glb \
  --quantize-normal 14 --quantize-position 14 --quantize-texcoord 14
```

---

## Optimización aplicada en Max (lo que ya está hecho)

### Tabla de operaciones por grupo

| Grupo | Método | Vertex % / Iter | Tris ahorrados |
|---|---|---|---|
| `Tire sidewall*` (4 ruedas, 328 leaf meshes) | Attach + ProOptimizer | 30% | ~510k |
| `Plane.hp.*` (puertas + asientos, 14 meshes) | Attach + ProOptimizer | 25% | ~3M |
| `Plane.hp.012` (puerta L individual, 677k) | ProOptimizer individual | 20% | ~574k |
| Ruedas (Tire main, Nut, Cylinder, Fuchs_lip, Plane.46X/34X/35X/36X) — 24 meshes | Attach + ProOptimizer | 25% | ~1.1M |
| `Body` planes (207 meshes) | Smooth modifier (autosmooth=true, threshold=180) | N/A (preserva polys) | 0, fix de shading |

**Total bajada en Max**: 7.68M → 2.87M tris (63% reducción).

### Workflow general que funcionó

1. Script en Listener: `selectByPrefix "<nombre>"` (selecciona todos los descendientes geom)
2. Script en Listener: `attachSelectedIntoOne()` (mergea todo en un mesh único)
3. UI manual: Modify Panel → ProOptimizer → Calculate → Vertex % → Collapse To
4. Script: `countTotalTris()` para validar bajada

**Por qué NO se hizo todo automático**: ProOptimizer en MAXScript no triggea bien el Calculate. La función `m.Calculate = true` no fuerza la evaluación. Quedan al 0/N optimizados aunque el modifier se aplique. **El paso de ProOptimizer SIEMPRE se hizo manual en UI**. El attach + select sí va por script.

---

## Helpers MAXScript que sí funcionan

Pegá esto en un editor nuevo de Max + Ctrl+E al inicio de cualquier sesión:

```maxscript
fn collectDescendants node arr = (
    for c in node.children do (
        append arr c
        collectDescendants c arr
    )
)

fn selectByPrefix prefix = (
    clearSelection()
    local plen = prefix.count
    local roots = #()
    for o in objects do (
        if o.name.count >= plen do (
            if (substring o.name 1 plen) == prefix do (append roots o)
        )
    )
    local all = #()
    for r in roots do (
        append all r
        collectDescendants r all
    )
    local geomCount = 0
    for o in all do (
        if (superClassOf o == GeometryClass) do (selectMore o; geomCount += 1)
    )
    format "Encontrados % / % geom con prefijo: %\n" all.count geomCount prefix
    geomCount
)

fn attachSelectedIntoOne = (
    local arr = selection as array
    if arr.count < 2 do (format "Necesito >=2 seleccionados\n"; return undefined)
    local base = arr[1]
    if (classOf base != Editable_Poly) do convertTo base Editable_Poly
    local count = 0
    for i = 2 to arr.count do (
        if (superClassOf arr[i] == GeometryClass) do (
            try (polyOp.attach base arr[i]; count += 1) catch ()
        )
    )
    select base
    format "Attached % objetos en '%'\n" count base.name
    base
)

fn countTotalTris = (
    local total = 0
    for o in objects do (try (total += getNumFaces o.mesh) catch ())
    format "TOTAL TRIS: %\n" total
    total
)

format ">> Helpers cargados OK\n"
```

---

## Quirks de MAXScript 3ds Max 2026

Encontrados durante esta sesión:

### ProOptimizer
- ❌ Propiedad `OptimizationLevel` NO existe → da `Unknown property`
- ❌ Propiedad `PreserveBoundaries` NO existe → da `Unknown property`
- ✅ Propiedades válidas: `Calculate`, `VertexPercent`, `MergePoints`, `PreserveBoundary` (singular), `PreserveTextureCoordinates`, `PreserveNormals`
- ❌ `m.Calculate = true` NO triggea el cálculo real desde script — el modifier queda aplicado pero sin reducción. **Solo funciona desde UI**.
- ✅ Workaround: usar script solo para select + attach, hacer ProOptimizer manual en UI.

### Smooth modifier
- ❌ Propiedad `autoSmooth` (camelCase) NO existe → `Unknown property`
- ✅ Propiedad correcta: `autosmooth` (todo minúsculas)
- ❌ Propiedad `smoothBias` NO existe → `Unknown property`
- ✅ Propiedad correcta: `threshold`
- ✅ Para crear: `smoothmodifier()` (no `Smooth()`)
- ✅ Propiedades válidas: `autosmooth`, `preventIndirect`, `threshold`, `smoothingBits`

### Listener parsing
- Los bloques multilínea pegados directo en el Listener con sangría rompen el parser → "Syntax error: at )".
- **Solución**: pegar en Editor (Ctrl+N), Ctrl+E para ejecutar todo. NO pegar multilíneas en el Listener.
- **Excepción**: comandos de 1-3 líneas sin sangría sí se pueden pegar en el Listener.

### Naming
- Los grupos del FBX importado vienen como **Dummy** helpers (parent), con la geometría como children.
- `selectByPrefix` debe recorrer descendientes para llegar a los Editable_Mesh/Editable_Poly.
- Cualquier filtro `if classOf o == Dummy do ...` los excluye — usar `superClassOf o == GeometryClass` en su lugar para filtrar geom.

### Selección con `$`
- ❌ `$Plane.hp.012` falla porque MAXScript parsea los puntos como property accessors.
- ✅ Usar `getNodeByName "Plane.hp.012"` en su lugar.

---

## Pipeline gltf-transform en VPS

### Versión final recomendada (Draco normales 14-bit, materiales preservados)

```bash
cd /tmp
npx -y @gltf-transform/cli optimize /root/INPUT.glb /tmp/step1.glb \
  --compress false \
  --texture-compress webp \
  --simplify false \
  --palette false \
  --texture-size 4096 \
  --join false

npx -y @gltf-transform/cli draco /tmp/step1.glb /root/OUTPUT.glb \
  --quantize-normal 14 \
  --quantize-position 14 \
  --quantize-texcoord 14
```

### Versión "máxima calidad" (sin Draco, solo WebP)

```bash
npx -y @gltf-transform/cli optimize /root/INPUT.glb /root/OUTPUT_RAW.glb \
  --compress false --texture-compress webp --simplify false --palette false \
  --texture-size 4096 --join false
```

### Versión "sweet spot" (con optimize completo, perdés nombres de materiales por palette)

```bash
npx -y @gltf-transform/cli optimize /root/INPUT.glb /root/OUTPUT_TINY.glb \
  --compress draco --texture-compress webp
```

### Flags importantes

- `--simplify false` — NO reducir polys post-export (los redujimos ya en Max).
- `--palette false` — NO consolidar materiales (perderías los nombres semánticos).
- `--join false` — NO unir meshes (querés conservarlos separados para hide/show en el configurador).
- `--texture-size 4096` — NO downsize de texturas (4K original).
- `--quantize-normal 14` — Draco con 14 bits en normales (vs 10 default) para curvas smooth.

---

## Decisiones de diseño tomadas

1. **Sin animación de aperturas** — para la primera versión, el configurador va a **ocultar piezas** (door, hood, etc) en vez de animarlas con pivot. Esto elimina la necesidad de:
   - Setear pivotes en Max
   - Renombrar piezas a `Hood`, `Door_L`, etc.
   - Implementar lógica de GSAP/animación en código.

2. **Mapeo de nombres en código, NO en el modelo** — el configurador va a leer los nombres reales del modelo (`Bonnet`, `Door L`, `Wheel FL steer`, etc) y mapearlos a sus controles UI vía config. No se renombran materiales ni piezas en Max.

3. **Texturas a 4K conservativo** — la pintura `Paint_ext` mantiene textura 4K aunque el configurador la override en código (el navegador sigue pagando la descarga, pero es manejable con WebP).

4. **Escala**: el modelo viene en **unidades de pulgadas** (bbox ~70 × 50 × 162 para un auto de 4.25m × 1.65m × 1.3m). El factor de escala = **0.0254** para convertir a metros. Esto se aplica en el código del configurador al cargar el GLB con Three.js (no se modifica el GLB).

5. **Material `paint`** — sigue teniendo su `baseColorTexture` de 4096×2048 (era 8192×4096 original, ya bajamos). El configurador la override con color dinámico en código vía Three.js material override.

---

## Próximos pasos (después de re-export v5)

1. ✅ Validar `v5_RAW.glb` en https://gltf-viewer.donmccurdy.com/ — fenders deben verse smooth.
2. ✅ Si OK, procesar a `v5_FINAL.glb` con Draco 14-bit.
3. ⬜ Clonar repo `5antuca/gerstnersinger911` en VPS (configurador).
4. ⬜ Dropear `v5_FINAL.glb` en `public/models/`.
5. ⬜ Correr `npx gltfjsx public/models/Porsche_v5_FINAL.glb -o src/components/3d/Car.tsx -t`.
6. ⬜ Adaptar código del configurador para usar nombres reales del modelo (`Paint_ext`, `Bonnet`, etc.) vía config.
7. ⬜ Implementar UI de hide/show por toggles (sidebar con checkboxes).
8. ⬜ Aplicar escala 0.0254 al cargar.
9. ⬜ Material `paint` con color dinámico (override baseColor).
10. ⬜ Deploy a `studio.gerstnerwerks.com`.

---

## Contexto del archivo entregado por el artista

- **Origen**: modelado en SketchUp Pro 2026 por el contacto de Gerstner, importado a 3ds Max para optimización.
- **Estructura**: bien organizado por grupos (Interior, Exterior_body, Wheels). Las piezas móviles ya están separadas como Components (Door L, Door R, Bonnet, Wheel FL steer, etc).
- **Calidad de modelado**: alta — interior completo (Momo steering wheel, gauges, Leather, brakes, exhaust, emblems, todo). Era un asset comercial probablemente.
- **Lo que faltaba según la spec original** (ver [[Feedback_Entrega1_PorscheSinger.pdf]]):
  - Compresión Draco / KTX2 (resuelto en VPS post-export)
  - Polycount excesivo (resuelto en Max con ProOptimizer)
  - Nombres de materiales no semánticos (decidimos mapear en código)
  - Pintura con baseColorTexture horneada (resuelto borrando texture y dejando color)
  - Sin Engine Lid separado (decidimos NO separarlo, será solo "Hood")
  - Sin pivotes en bisagras (decidimos NO animar, solo hide/show)

---

## Tamaños de referencia para retomar

- **Target**: < 25 MB final, idealmente 10-15 MB con Draco
- **Original entrega**: 268 MB, ~3M tris (medidos en GLB), 83 materiales, sin compresión
- **v4 (post-Smooth)**: 99 MB raw, 13 MB con Draco 16-bit
- **Sweet spot esperado v5 (post-TurboSmooth + Draco 14-bit)**: ~12-15 MB con fenders smooth
