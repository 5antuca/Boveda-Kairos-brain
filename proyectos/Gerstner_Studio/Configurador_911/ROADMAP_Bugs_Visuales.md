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

### 1. Acrílico verde — ✅ ELIMINADO (solo el acrílico; spoiler y grilla SE MANTIENEN)
- Decisión final: borrar **solo el acrílico volador** = el plexi verde `Circle.011` (`Plexi_bubbles`). La grilla/spoiler (`Plane`, `Plane.015`, `Plane.027`, bolts) **queda en su lugar**. `export_glb.py` `REMOVE` = `['Plane.394','Plane.393','Plane.245','Circle.011']`.
- (Nota: hubo un paso donde se borró todo el assembly por error; corregido — solo `Circle.011`.)

### 2. Llantas (Fuchs) — artefactos/z-fighting
- **Síntoma:** parpadeo en la llanta.
- **Causa probable:** caras solapadas entre labio (`Fuchs_1`) y cara (`Fuchs_2`), o entre llanta y disco/campana; posible amplificación por cuantización draco de posición.
- **Solución:** revisar geometría de la Fuchs en Blender (merge/offset de caras coplanares); validar contra export sin draco; ya se subió `--quantize-position` 14→16 para mitigar.

### 3. Ópticas / faros delanteros — ✅ mitigado en código
- **Síntomas reportados:** de lejos los cristales DESAPARECEN y aparecen CUADRADOS NEGROS en los marcos.
- **Causas (confirmadas):** (a) `Lamp_chrome` + `Headlamp_bulb` venían en metalness 1 / **roughness 0 = espejo perfecto** → aliasing especular a distancia = cuadrados negros. (b) `Headlamp_glass` usaba **transmission (refracción) + alpha baja** → la transmission no se renderiza a distancia y el cristal desaparece.
- **Fix en `Car.tsx`:** `Lamp_chrome`/`Headlamp_bulb` → METAL_MATS roughness 0.3. Vidrios de faro (`LENS_GLASS`) → `transmission=0`, transparencia simple, opacidad piso 0.6, `depthWrite=false`. + filtrado anisotrópico (mipmaps).
- **Pendiente fino (Fase 2):** si quedan z-fighting de capas lente/reflector muy cercanas, separarlas unos mm en Blender.

### 4. Faros traseros — ✅ mismo fix que #3
- Lentes coloreadas (`Glass_red`, `Glass_orange`, `Glass_parking_light`) estaban en el set `LENS_GLASS` → transmission off + transparencia estable. Verificar de lejos.

## 🆕 Resueltos (sesión 2026-05-29, parte 2)
- **"Cuadrados"/baja resolución de lejos** (faros, metales, acrílico) = **aliasing de mipmaps**. ✅ Fix en `Car.tsx`: filtrado **anisotrópico máximo + trilineal** (`LinearMipmapLinearFilter`) en TODAS las texturas (`map/normalMap/roughnessMap/metalnessMap/aoMap/emissiveMap`) vía `gl.capabilities.getMaxAnisotropy()`.
- **Acrílico verde glitcheaba** (transparente + textura de huecos procedural). ✅ Workaround en código: `Plexi_bubbles` → plexi ahumado liso (`#1c1f1c`, opacity 0.6, sin textura, `depthWrite=false`). El look perforado "de serie" exacto requiere el bake (Fase 2).
- **Pinzas rojas**: el `dedup` borraba `Brake_caliper` → hecho rojo/distinto en Blender (CR4). ✅
- **Tapas oil/fuel**: metal con letras (textura invertida en canvas para letras grises sutiles + normal map). ✅ Pendiente: centrar UV (item 5).
- **Guardabarros izq.**: re-export con `weld 0` (a verificar por el usuario).

## 🎨 Ajustes de color/material (estado)
- ✅ Piso interno (`Plastic_int_matt`) → oscuro. Alfombras (`Carpet_*`) → negro. Gomas → negro mate.
- ✅ Llantas → plata satinada + labio pulido (default).
- ✅ Pinzas de freno → **rojo pintura** (`Brake_caliper`, metalness 0).
- ✅ Tapas oil/fuel → **metal** (`Fuel_oil_caps`).
- ✅ Espejo → reflejo brillante (envMapIntensity 3.0) en vez de negro.
- ✅ Relojes → vidrio oscuro transparente (se ve el dial), no blanco.
- ⏳ "Más anodizado": metales de interior (`Alu_int`, `Metal_ext_rough`) aún algo claros → opción de bajarlos a charcoal satinado.

### 5. Tapas oil/fuel — letras descentradas (UV)
- **Síntoma:** la tapa quedó metal pero las letras FUEL/OIL no están centradas en el domo; la de OIL mapea mal.
- **Causa:** UV de los meshes `Sphere.000` (fuel) y `Sphere.026` (oil) no alinea el label al centro del domo. La textura `fuel_cap_2` tiene FUEL (arriba) + OIL (abajo) en una sola imagen; cada tapa debe mapear su mitad centrada.
- **Referencia real:** domo cromado pulido con FUEL grabado, centrado, en anillo negro moleteado (ver `Vistas/.../Tapa De Combustible`).
- **Solución (Blender):** reproyectar/centrar la UV de cada tapa sobre su label; mantener metal (`Fuel_oil_caps` metal + normal map). En código ya se dejó metal con `normalScale` alto.

### 6. Deformidad en el guardabarros delantero izquierdo
- **Síntoma:** abolladura/deformación en el guardabarro izq. delantero (visible en el configurador).
- **Causa:** NO está en el `.blend` original (render directo del pack = liso) → se introduce en el **pipeline de export**: candidatos = `weld` del `optimize` (fusiona vértices y pellizca superficies suaves), `apply_modifiers` (lattice), o cuantización draco.
- **Solución a probar (orden):** (a) re-exportar con `optimize ... --weld 0` (desactivar weld); (b) si persiste, subir `--quantize-position` o exportar sin draco para aislar; (c) revisar si un lattice deforma ese panel al aplicar modifiers.

## ▶️ Orden sugerido
1. Fase 2 bake de procedurales (`Plexi_bubbles`, `Internals`, `Radiator`, reflectores de luces) → mata el verde y baja z-fighting.
2. Convertir Diffuse→Principled en `export_glb.py` (CR1) → elimina los "blancos" de raíz, sin overrides en código.
3. Offset de capas coplanares en luces + acrílico (geometría Blender).
4. Re-export + re-optimize (receta en [[Optimizacion_3D]]) y validar en `npm run dev`.
