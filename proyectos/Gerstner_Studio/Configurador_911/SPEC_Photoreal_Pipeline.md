---
tags: [gerstner-studio, configurador-911, photoreal, spec, handoff, blender]
fecha: 2026-05-29
estado: ACTIVO — Fase 1 (base limpia) lista para arrancar en la Mac
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

## ▶️ Próximo paso inmediato
Abrir `911 by Singer (2.82 packed).blend` en Blender → export glTF → optimizar → drop en `public/models/` → `MODEL_URL` → `npm run dev` → comparar contra el actual. Si mejora, push a `main`.

## 🔗 Relacionado
[[Optimizacion_3D]] (detalle de la sesión + recetas gltf-transform + quirks) · [[ROADMAP]] (fases del producto) · [[ROADMAP_Modelo_Singer_3D]] · [[README]]
