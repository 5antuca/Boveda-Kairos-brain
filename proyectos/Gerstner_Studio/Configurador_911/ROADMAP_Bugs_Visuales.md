---
tags: [gerstner-studio, configurador-911, bugs, roadmap, spec, blender]
fecha: 2026-05-29
estado: ACTIVO — bugs visuales pendientes tras Fase 1
relacionado: "[[SPEC_Photoreal_Pipeline]]"
---

# ROADMAP — Bugs visuales del Configurador 911 (punto por punto)

> Lista accionable de artefactos visuales pendientes y su plan de solución.
> Contexto y pipeline completo en [[SPEC_Photoreal_Pipeline]]. El modelo vive en
> `~/Documents/gerstner_singer_pack/` (`.blend` en `…/blend_extracted/`); script de
> export = `export_glb.py`; overrides de material en `gerstnersinger911/src/components/3d/Car.tsx`.

## 🩹 Causas raíz (claves para todo lo demás)
- **CR1 — BSDF_DIFFUSE → blanco en glTF.** ✅ RESUELTO EN EL EXPORT. El exporter glTF solo lee el color del *Principled BSDF*; los *Diffuse* exportaban baseColor **blanco (1,1,1)** (síntoma: piso interno/plásticos/techo blancos). `export_glb.py` ahora **convierte Diffuse/Glossy→Principled** (sección `[NORMALIZE]`, 16 materiales) → los colores reales exportan bien de origen. Los `COLOR_MATS` en Car.tsx quedan como refuerzo.
- **CR2 — BSDF_GLOSSY → reflejo dependiente del env.** ✅ Normalizados a Principled metal en el export. Además `Mirror` con `envMapIntensity=3.0` en código para que espeje brillante con el env atenuado (0.65).
- **CR3 — materiales DUPLICADOS por nombre** en el GLB (ej. `Paint_ext` ×2). Resuelto recorriendo TODOS los slots (`applyToMaterials` en Car.tsx).
- **CR4 — el `dedup` de gltf-transform FUSIONA materiales idénticos.** `Brake_caliper` (gris 0.8) se fusionaba con otro material gris y DESAPARECÍA del GLB → las pinzas quedaban grises y el override por nombre no encontraba nada. ✅ Fix: hacer `Brake_caliper` ROJO y distinto en Blender (`export_glb.py` sección `[CALIPER]`) → sobrevive el dedup y exporta. Lección: si un override de material "no hace nada", verificar que el material exista en el GLB (`gltf-transform inspect`); puede haberse deduplicado.
- **CR5 — baseColorTexture oscura tapa el color.** Las tapas oil/fuel (`Fuel_oil_caps`) traen una textura de color (tapón negro + letras) → se veían negras. ✅ Fix en código: `m.map=null` + `metalnessMap/roughnessMap=null`, color metal `#c4c4c4`, metalness 1; se MANTIENE el `normalMap` → tapas metal con letras en relieve. ⏳ Pendiente: la tapa OIL tiene el texto mal puesto (UV incorrecta en ese mesh) → fix de UV en Blender (Fase 2).

## 🐞 Bugs a solucionar

### 1. Acrílico verde que "vuela" sobre el spoiler — z-fighting + color
- **Síntoma:** la rejilla/stone-guard trasera (que el usuario quiere DE SERIE, flotando) parpadea (z-fighting) y se ve verde plano.
- **Causa:** `Plexi_bubbles` (mesh `Circle.011`) es material **procedural** (no exporta → verde/plano) y sus caras quedan **coplanares/solapadas** con la rejilla metálica → z-fighting.
- **Solución:** (a) bakear el procedural a textura PBR en Blender (Fase 2); (b) separar levemente en Z las caras coplanares del plexi vs la malla; (c) si se mantiene transparente, revisar `depthWrite`/orden de transparencia.

### 2. Llantas (Fuchs) — artefactos/z-fighting
- **Síntoma:** parpadeo en la llanta.
- **Causa probable:** caras solapadas entre labio (`Fuchs_1`) y cara (`Fuchs_2`), o entre llanta y disco/campana; posible amplificación por cuantización draco de posición.
- **Solución:** revisar geometría de la Fuchs en Blender (merge/offset de caras coplanares); validar contra export sin draco; ya se subió `--quantize-position` 14→16 para mitigar.

### 3. Ópticas / faros delanteros — z-fighting
- **Síntoma:** parpadeo en el faro.
- **Causa:** capas muy cercanas — `Headlamp_glass` (lente) + `Lamp_chrome`/reflector + `Headlamp_bulb` — casi coplanares y transparentes.
- **Solución:** offsetear las capas (lente vs reflector) unos mm en Blender; asegurar transparencia correcta del vidrio (no opaco); bakear el reflector si es procedural.

### 4. Faros traseros — z-fighting
- **Síntoma:** parpadeo en el cluster trasero.
- **Causa:** lentes coloreadas solapadas (`Glass_red`, `Glass_orange`, `Glass_parking_light`) + housing.
- **Solución:** igual que #3 — separar capas de lente, transparencia correcta, revisar normales.

## 🎨 Ajustes de color/material (estado)
- ✅ Piso interno (`Plastic_int_matt`) → oscuro. Alfombras (`Carpet_*`) → negro. Gomas → negro mate.
- ✅ Llantas → plata satinada + labio pulido (default).
- ✅ Pinzas de freno → **rojo pintura** (`Brake_caliper`, metalness 0).
- ✅ Tapas oil/fuel → **metal** (`Fuel_oil_caps`).
- ✅ Espejo → reflejo brillante (envMapIntensity 3.0) en vez de negro.
- ✅ Relojes → vidrio oscuro transparente (se ve el dial), no blanco.
- ⏳ "Más anodizado": metales de interior (`Alu_int`, `Metal_ext_rough`) aún algo claros → opción de bajarlos a charcoal satinado.

## ▶️ Orden sugerido
1. Fase 2 bake de procedurales (`Plexi_bubbles`, `Internals`, `Radiator`, reflectores de luces) → mata el verde y baja z-fighting.
2. Convertir Diffuse→Principled en `export_glb.py` (CR1) → elimina los "blancos" de raíz, sin overrides en código.
3. Offset de capas coplanares en luces + acrílico (geometría Blender).
4. Re-export + re-optimize (receta en [[Optimizacion_3D]]) y validar en `npm run dev`.
