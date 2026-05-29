---
tags: [gerstner-studio, configurador-911, photoreal, spec, handoff, blender]
fecha: 2026-05-29
estado: ACTIVO — Fase 1 HECHA (local, sin pushear). Pendiente: decidir puerta cerrada + Fase 2 (bake)
entry-point: true
---

# SPEC — Pipeline Fotorrealista del Configurador 911 (Singer)

> [!tip] CÓMO USAR ESTE DOC
> Este es **el punto de entrada** para Claude Code corriendo en la **Mac**. Leelo entero y tenés todo el contexto + el plan. Para detalle profundo de la sesión de optimización ver [[Optimizacion_3D]]; para fases del producto ver [[ROADMAP]]. Sesión nueva = arranca en frío, este doc te pone al día.

## 🎯 Objetivo
Que el configurador en **studio.gerstnerwerks.com** se vea **fotorrealista** (calidad tipo configurador oficial de Porsche): carrocería suave, materiales PBR reales con texturas, reflejos de estudio, sombras/AO y post-procesado. Hoy se ve bien pero NO photoreal: el modelo es una versión degradada (sin UVs ni texturas).

## 🧭 Setup (Mac) — antes de empezar
- **Claude Code en la Mac**: `npm install -g @anthropic-ai/claude-code` (Node 18+), se lanza con `claude`.
- **Blender**: `/Applications/Blender.app/Contents/MacOS/Blender --version` (manejarlo por `--background --python script.py`).
- **Repos** (hacer `git pull` primero):
  - Configurador: `/Users/5an/Documents/gerstnersinger911` (commits actuales hasta `aaf11b1`).
  - Vault: `/Users/5an/Documents/Kairos_Brain` (este doc).
- **Pack fuente**: `~/Downloads/Porsche 911 reimagined by Singer free pack-…zip` (descomprimir).

## 📦 Estado actual del configurador (LIVE)
- **Stack**: Next 16 + React Three Fiber + drei + three + gsap + zustand. Deploy **Vercel** desde GitHub `5antuca/gerstnersinger911` → **studio.gerstnerwerks.com**. `git push origin main` = deploy live.
- **Modelo actual**: `public/models/PorscheSinger.glb` (= `Porsche_v4_HIQ`, 13MB). **Degradado**: viene de SketchUp→Max, **sin UVs**, meshes soldados en blobs, fenders facetados.
- **Código** (`src/components/3d/Car.tsx`): loader genérico `<primitive object={gltf.scene}>` (model-agnostic, swap = cambiar `MODEL_URL`), escala `0.0254` (pulgadas→m), grounding por **mediana del fondo de meshes `Tire_base`** (las 4 ruedas; ignora auxiliar interna + blobs), pintura `MeshPhysicalMaterial` con clearcoat + color dinámico del store, metales PBR vía mapa `METAL_MATS`, acabado mate interior vía `FINISH_MATS`. `Scene.tsx`: cámara `OrbitControls` con damping + autoRotate suave, `Environment preset="city"`, `ContactShadows`. Store `useConfiguratorStore.ts`: colores de pintura, llantas, interiores.

## 🔑 Hallazgos técnicos (por qué hace falta el pipeline Blender)
1. **El modelo actual no tiene UVs** (499/534 prims sin `TEXCOORD_0`, todo el interior sin UV) → **imposible aplicar texturas de imagen** tal cual.
2. **El pack fuente SÍ tiene UVs + geometría limpia** (`.blend` 2.82 packed 112MB, FBX 195MB, C4D). Mismos nombres de material → el del 3D degradó este pack.
3. **Los materiales del pack son PROCEDURALES** (shaders Blender/C4D). El pack solo trae texturas de *detalle* (decals, emblema normal/displacement, cinturón normal, goma normal, máscaras). **Los procedurales NO se exportan a glTF** → para photoreal hay que **bakearlos** a mapas de imagen.
4. SketchUp exporta todo con `metalness=0` → por eso los metales se veían blancos. El pack en Blender (Principled BSDF) **sí exporta metalness/roughness correctos**.

## 🛣️ Roadmap a fotorrealista

### Fase 1 — Base limpia (alto impacto, bajo riesgo) ← ARRANCAR ACÁ
- Abrir `911 by Singer (2.82 packed).blend` en Blender.
- **Export glTF 2.0** (.glb): `+Y Up`, `Apply Modifiers`, incluir materiales + texturas de detalle. (Si el FBX es más cómodo, sirve igual.)
- **Optimizar para web** en la Mac (`npx @gltf-transform/cli`): `optimize --texture-compress webp --texture-size 4096 --join false` + `draco --quantize-normal 14 --quantize-position 14 --quantize-texcoord 14`. Target < 25MB. Recetas exactas en [[Optimizacion_3D]].
- Drop en `public/models/`, ajustar `MODEL_URL` en `Car.tsx`, probar `npm run dev`.
- **Reconciliar código**: con metalness correcto desde el GLB se pueden **achicar/quitar `METAL_MATS`**; re-verificar grounding (debería seguir andando por `Tire_base`). **Mantener color de pintura dinámico**.
- Resultado esperado: carrocería suave (sin facetas), UVs, metales reales, normales de detalle. Salto grande.

### Fase 2 — Bake de procedurales → texturas PBR (núcleo del photoreal)
- Por material procedural (`Leather_*`, `Carpet_in`, `Paint_ext`, plásticos…), **bake en Blender (Cycles)** a mapas: baseColor (albedo), roughness, normal, AO.
- Verificar/armar UVs para bake donde falte; resolución 2–4k; empaquetar en el GLB.
- Re-export + re-optimizar. Esto da grano de cuero, tejido, detalle real.
- Tensión a resolver: **pintura configurable** vs albedo bakeado → mantener `Paint_ext` como PBR sólido (color del store) + clearcoat + (opcional) normal de flake; bakear todo lo demás.
- Al terminar, los hacks de material en código (`METAL_MATS`/`FINISH_MATS`) se vuelven innecesarios — el look vive en el GLB.

### Fase 3 — Pulido del configurador (web, lo hace Claude Code)
- **HDRI de estudio**: usar `public/env/MR_INT-005_WhiteNeons_NAD1K.hdr` (ya está) en vez del preset "city" → reflejos showroom.
- **Post-procesado** (`@react-three/postprocessing`): SSAO (AO), Bloom (highlights), SMAA, tone mapping / color grading.
- Tunear luces, contact shadows, encuadre de cámara.

### Fase 4 — Features del configurador (ver [[ROADMAP]])
- Cablear selección de color/llantas/interior al modelo nuevo (nombres de material reales).
- Persistencia (Mongo), códigos de configuración compartibles.

## ⚠️ Reglas duras (no romper)
- **Mantener nombres de material**: `Paint_ext` (pintura), `Fuchs_1/Fuchs_2/Fuchs_cap` (llantas), `Tire_base` (piso/grounding), `Leather_*`, `Chrome`, `Alu_*`, `Emblem_*`, etc. El código del configurador depende de ellos.
- **Color de pintura siempre dinámico** (es feature del configurador) → overridable desde el store.
- **Deploy = push a `main` → Vercel publica LIVE** en studio.gerstnerwerks.com. SIEMPRE `npm run build` + `npm run dev` antes de pushear.
- **No romper** el loader genérico, la escala `0.0254` ni el grounding.
- El modelo se commitea a git (Vercel lo sirve de `/public`). Vigilar tamaño (<25MB ideal).

## ✅ Resultado Fase 1 (2026-05-29) — HECHO en local, NO pusheado
- Pack en `~/Documents/gerstner_singer_pack/`. El `.blend` venía como zip anidado (`911_blend_2.82_packed.zip` → 107MB blend). Scripts de export/inspección quedaron ahí (`export_glb.py`, `inspect*.py`).
- **Export**: Blender 4.5.3 headless. Pipeline en `export_glb.py`:
  1. Renombrar materiales `espacio→_` y `punto→_` (ej. `Paint ext`→`Paint_ext`, `Emblem gold.bump`→`Emblem_gold_bump`). Reproduce EXACTO el contrato de nombres que espera `Car.tsx` (METAL_MATS/FINISH_MATS/PAINT_MAT/FLOOR_MATS) → **código intacto, no se tocó nada de materiales**.
  2. Borrar 3 meshes helper SIN material (`Plane.052/.014/.433`, cages de `Lattice_&_deformers`) que renderizaban como **planos blancos** flotando sobre el auto. NO son parte del auto.
  3. Export GLB: `+Y up`, apply modifiers, materiales + texturas de detalle.
- **Optimize** (gltf-transform): `optimize --texture-compress webp --texture-size 4096 --simplify false --palette false --join false` + `draco --quantize-* 14`. **219MB → 21MB** (bajo target 25MB). `--join/--palette/--simplify false` para preservar materiales por nombre.
- **Integración** (`Car.tsx`): `MODEL_URL = '/models/SingerClean.glb'` y **`SCALE = 1.0`** (¡el pack original viene en METROS, ~4.9m de largo — NO en pulgadas como el degradado, por eso ya NO va 0.0254!). El modelo viejo `PorscheSinger.glb` quedó en `public/models/` para rollback.
- **Verificado** en `npm run build` (OK) + `npm run dev`: carrocería suave sin facetas, pintura clearcoat dinámica funcionando (probado cambio de color), asientos pepita con textura real, ruedas Fuchs apoyadas (grounding por `Tire_base` OK), cero errores de consola. Salto enorme de calidad. ✔

### 🔧 Ajustes post-feedback (2026-05-29, misma sesión)
- **Rejilla/stone-guard trasera LEVITABA** ~0.2m sobre los louvers del motor (assembly `Group.001`+`Group.002`: `Plane`,`Plane.015`,`Plane.027`,`Circle.011`,`Bolt.019/020`,`Lattice.001`). Fix en `export_glb.py`: bajar el assembly `-0.20` en Z → asienta dentro del recess (look RSR). Decisión del usuario: mantenerla bajada (no borrarla).
- **Todo se veía sobre-brillante/reflejado**: el código estaba tuneado para el modelo viejo (metalness=0 en todo). El GLB nuevo trae PBR real → los hacks se sumaban de más. Reconciliado:
  - `Scene.tsx`: `toneMappingExposure 1.6→1.0`, `ambientLight 1.2→0.5`, `directionalLight` key 0.8→0.6 / fill 0.9→0.5 / rim 0.4→0.3, `Environment environmentIntensity 1.3→1.0`.
  - `Car.tsx`: pintura `clearcoatRoughness 0.06→0.10` y `envMapIntensity 1.25→1.0`; `METAL_MATS` envMapIntensity `1.3→1.0`; agregadas gomas a `FINISH_MATS` (`Rubber/Tire_rough/Tire_base/Tire_extrude/Wiper_rubber ~0.9`, `Plastic_ext_matt 0.85`) — el pack las traía en roughness 0.5 (plásticas).
  - Resultado: navy se lee profundo (antes lavado a celeste), reflejos de estudio realistas, gomas mate. ✔
- **Acrílico verde de la rejilla se veía bugueado** (clipeaba al bajarlo + verde por material procedural): borrado `Circle.011` (`Plexi_bubbles`) en `export_glb.py`. Queda la rejilla metálica recesada limpia.
- **Eliminados emblemas "Singer"** (pedido del usuario): `Plane.394` (`Emblem_gold`, script "Singer" trasero) + `Plane.393` (`Emblem_sticker`, "reimagined") + `Plane.245` (`Chrome`, badge del tablero). Los emblemas **Porsche** se mantienen.

### ⚠️ Hallazgos pendientes (no bloquean Fase 1)
1. **Puerta del conductor modelada ABIERTA** (~70°) en el pack fuente (colección `Door`, 14 meshes). Para el configurador conviene cerrarla por default → rotar los objetos de `Door` a posición cerrada en Blender y re-exportar. Decisión pendiente del usuario.
2. **Bahía de motor / radiador + plexi de la rejilla se ven verde-azulado**: material procedural `Internals`/`Radiator`/`Plexi bubbles` (TEX_WAVE+EMISSION) que no exporta a glTF → se ve plano/verde. Territorio de **Fase 2 (bake)**.
3. **Encuadre de cámara** un toque cerrado con el modelo nuevo; el usuario puede zoom out (maxDistance 8). Eventual ajuste fino en Fase 3.

## ▶️ Próximo paso inmediato
1. Revisar el modelo nuevo en el browser y decidir: ¿cerrar la puerta? ¿pushear a `main` (= deploy LIVE)?
2. Si OK → `git add public/models/SingerClean.glb src/components/3d/Car.tsx` + push.
3. Después: Fase 2 (bake de procedurales) o Fase 3 (HDRI estudio + post-procesado).

## 🔗 Relacionado
[[Optimizacion_3D]] (detalle de la sesión + recetas gltf-transform + quirks) · [[ROADMAP]] (fases del producto) · [[ROADMAP_Modelo_Singer_3D]] · [[README]]
