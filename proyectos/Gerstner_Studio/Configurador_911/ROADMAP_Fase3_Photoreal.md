---
tags: [gerstner-studio, configurador-911, photoreal, fase3, lighting, shading, roadmap, spec]
fecha: 2026-05-29
estado: ACTIVO — Fase 3 (realismo cinematográfico). Arranca aplicación.
relacionado: "[[SPEC_Photoreal_Pipeline]]"
---

# ROADMAP — Fase 3: Realismo cinematográfico (Configurador 911)

> Objetivo: que el auto se vea **ultra realista / premium** tipo fotografía automotriz Porsche.
> Principio guía: **Realismo = iluminación + materiales + imperfección + cámara + contraste** (NO más modelado).
> Todo debe ser **model-agnostic**: vive en `Scene.tsx` (luz/cámara/post) y en overrides por nombre de material en `Car.tsx`, así otro modelo hereda total o parcialmente el look.

## Principio: Porsche también "fakea"
No perseguir física perfecta ni raytracing total. Perseguir **percepción premium**: reflejos simplificados, cosas bakeadas, trucos visuales. Las imperfecciones NO deben verse conscientemente, solo percibirse.

## Prioridades
1. **Materiales** (pintura, neumáticos, vidrios, chrome)
2. **Iluminación HDRI profesional** (studio automotive / softbox / dark studio)
3. **Cámara cinematográfica**
4. **Contact shadows / contacto con el piso**

---

## Puntos a resolver (punto por punto)

### 1. Reflejos: hoy parece procedural limpio / casi plástico
Falta: HDRI de estudio automotriz REAL, reflejos más **estirados**, clearcoat layer, **micro roughness**.
- **Plan:** `Environment` con HDRI propio (`/env/MR_INT-005_WhiteNeons_NAD1K.hdr`) + `Lightformer`s (tiras horizontales tipo softbox) dentro del `<Environment>` para reflejos largos/suaves en la carrocería. Subir `envMapIntensity` de pintura/chrome. Micro variación de roughness (clearcoatRoughness leve + no-uniforme).

### 2. Pintura: se siente uniforme / plana
Un auto real: basecoat + metallic flakes + clearcoat + micro imperfecciones. **Truco:** roughness NO uniforme.
- **Plan:** `MeshPhysicalMaterial` pintura: `clearcoat 1`, `clearcoatRoughness` leve (~0.05-0.08), `metalness` leve para flake, `roughness` ~0.4 con micro-variación (roughnessMap sutil o sheen), `envMapIntensity` alto. Opcional: normal map de "orange peel" muy sutil + flake sparkle.

### 3. Vidrio: demasiado limpio (shader transparente simple)
Falta: espesor, tinte leve, reflections más fuertes, interior ligeramente oscurecido.
- **Plan:** ventanas (`Glass_ext`): tinte leve (gris/verde oscuro), `roughness` muy bajo + `envMapIntensity` alto (reflejos fuertes), interior se oscurece a través del vidrio. OJO: los vidrios de FAROS usan transparencia simple (sin transmission) por el bug de "desaparecen a distancia" — mantener eso. Para ventanas se puede subir reflexión sin transmission pesada.

### 4. Neumáticos: lo menos realista del auto
Falta: textura lateral, micro bump, goma menos negra, desgaste sutil, roughness irregular.
- **Plan:** subir base de goma de negro puro a charcoal (~#1a1a1a), mantener/realzar el normal map del neumático (micro bump del flanco + tread), roughness alto pero **no uniforme**, leve desgaste. Realzar el lettering del flanco (MICHELIN).

### 5. Imperfecciones microscópicas (lo que hace que se vea real)
tiny dust, orange peel sutil, micro scratches, irregularidad mínima — NO visibles conscientemente.
- **Plan:** roughness maps/normal maps sutiles globales (detalle); por ahora, micro-variación de roughness por material. (Texturas de detalle = paso posterior.)

### 6. Iluminación: necesita contraste cinematográfico
Hoy todo uniforme. Falta: key light definida, highlights largos, zonas oscuras reales, profundidad. Fotografía automotriz usa contraste MUY agresivo.
- **Plan:** key light fuerte y direccional + fill bajo + ambient bajo. Zonas oscuras reales. Highlights largos vía Lightformers.

### 7. Interior demasiado "expuesto"
En autos reales el interior raramente se ve tan iluminado.
- **Plan:** oscurecer el interior, dejar highlights específicos, que se intuya más que mostrarse. (Bajar ambient/fill, o un leve oscurecido del interior.)

### 8. Cámaras parecen "orbitales 3D"
Falta: más fotográficas, más bajas, focal más larga (~80mm), menos distorsión, ángulos cinematográficos.
- **Plan:** bajar `fov` (~22-26° = focal larga), bajar la altura de cámara, encuadres más cinematográficos. Menos distorsión de gran angular.

### 9. Suelo: necesita contacto físico
Hoy es sombra suave / piso abstracto. Falta: reflexión MUY leve, gradiente debajo del auto, AO más fuerte cerca de ruedas.
- **Plan:** `ContactShadows` más marcadas + piso con reflexión sutil (`MeshReflectorMaterial` de drei) + gradiente. Ancla el vehículo.

### 10. Post-procesado (requiere instalar)
SSAO (AO), Bloom (highlights), SMAA (antialias), tone mapping / color grading.
- **Plan:** `npm i @react-three/postprocessing postprocessing` → `EffectComposer` con SSAO + Bloom sutil + SMAA + tone mapping. (Paso final; agrega dependencia.)

---

## ✅ Ajustes adicionales (2026-05-29, parte 3)
- **Llantas two-tono real:** `Fuchs_1` (rayos + labio) = color del selector; `Fuchs_2` (valles/fondo recesado) = gunmetal oscuro fijo (`#262626`); `Fuchs_cap` = color. Matchea la Fuchs real (rayos claros + valles oscuros).
- **Fondo de estudio:** `Environment background` con `backgroundBlurriness 0.6` + `backgroundIntensity 0.28` → estudio 360° desenfocado y atenuado (gradiente, no negro plano).
- **Intermitente delantero tapado por el guardabarros:** la lente (`Glass_orange`) comparte mesh con el panel pintado (submeshes coplanares → z-fighting). Fix: `polygonOffset` negativo en las lentes (`LENS_GLASS`) → quedan como capa superior. (Verificar de cerca; si persiste es geometría → Blender.)

## ✅ Estado de aplicación (2026-05-29)
- **P1 (Scene.tsx) — HECHO:** HDRI estudio real (`/env/MR_INT-005_WhiteNeons_NAD1K.hdr`, `environmentIntensity 1`, background oscuro) → reflejos de estudio estirados. Cámara cinematográfica (`fov 24` ≈ focal larga, ángulo bajo, target 0.55, dist 5-12). Luces de contraste (key 1.5 + fill 0.35 + spot rim 0.7, ambient 0.22). `ContactShadows` marcadas (scale 16, blur 2.6, opacity 0.9, far 2.2) → ancla el auto. Fondo `#15171a` = gradiente.
- **P2 (Car.tsx materiales) — HECHO:** Pintura `MeshPhysicalMaterial` con clearcoat profundo (`clearcoatRoughness 0.06`), `sheen` (profundidad basecoat), `envMapIntensity 1.5`. Metales/chrome `envMapIntensity 1.3` (reflejos largos). Ventanas `Glass_ext` con tinte frío + reflejos fuertes (`roughness 0.03`, `envMapIntensity 2.2`, opacity 0.62, interior oscurecido). Gomas charcoal `#1b1b1b` (no negro puro) + roughness ~0.8 (no uniforme total) con normal map.
- **P3 (post-procesado) — BLOQUEADO:** `@react-three/postprocessing` v3 + `postprocessing` v6 con R3F v9 / three 0.184 → `EffectComposer` renderiza NEGRO (SSAO pide NormalPass y aun habilitándolo queda negro; Bloom+SMSAA solos también negro, sin error claro). Probable incompat de versiones. Desinstalado por ahora. **Pendiente:** resolver combo de versiones compatible (o usar `pmndrs/postprocessing` directo / `N8AO`) → SSAO + Bloom + SMAA + grading. El `antialias` MSAA del renderer ya está activo mientras tanto.
- **P4 (texturas de detalle)** — pendiente: orange peel, micro scratches, dust, roughness maps (máximo realismo).

## Orden de ejecución
- **P1 (sin instalar nada, máximo impacto):** Scene.tsx → HDRI + Lightformers + cámara cinematográfica + contraste de luces + ContactShadows/piso reflectante.
- **P2:** Car.tsx → pintura (clearcoat + micro roughness + flake), vidrio (tinte/reflejo), neumáticos (menos negro + micro bump + roughness irregular), chrome (reflejos largos).
- **P3:** Post-procesado (instalar postprocessing) → SSAO + Bloom + SMAA + grading.
- **P4:** Texturas de detalle (orange peel, scratches, dust) — opcional, máximo realismo.

## Model-agnostic
- `Scene.tsx` (HDRI, Lightformers, cámara, shadows, post) = 100% independiente del modelo.
- `Car.tsx` aplica calidad de material por NOMBRE (`Paint_ext`, `Glass_ext`, `Rubber`/`Tire_*`, `Chrome`, etc.) → otro modelo con esos nombres hereda el look; si difieren, se hereda parcial y se mapean los nombres nuevos.
