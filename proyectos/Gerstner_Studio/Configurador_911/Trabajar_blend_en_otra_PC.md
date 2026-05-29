---
tags: [gerstner-studio, configurador-911, blender, workflow, multi-pc]
fecha: 2026-05-29
relacionado: "[[SPEC_Photoreal_Pipeline]]"
---

# Trabajar el .blend en otra PC

> Cómo continuar editando el 3D del configurador 911 en Blender desde otra computadora.
> Pipeline y look completo en [[SPEC_Photoreal_Pipeline]] · [[ROADMAP_Fase3_Photoreal]].
> 🪟 **Setup específico para Windows** (PC `toroj`, carpeta `Santi 3D`): [[Setup_Windows_Santi3D]].

## Concepto clave (importante)
Hay DOS partes separadas:
1. **El 3D base** → se edita en **Blender** (geometría, UVs, butacas, materiales base). Vive en el `.blend`. **NO está en git** (pesa 107MB).
2. **El "look" cinematográfico** (pintura metálica, iluminación de estudio, cámara, colores de llantas/escape/vidrios) → vive en el **código web** (`gerstnersinger911`, en GitHub). Se aplica en runtime **por NOMBRE de material**. Blender NO necesita reproducir ese look.

➡️ En Blender se trabaja geometría/materiales base; el render final lo hace la web sola, siempre que se respeten los **nombres de material**.

## Qué transferir a la otra PC
De `~/Documents/gerstner_singer_pack/`:
- **El `.blend`**: `Porsche 911 reimagined by Singer free pack/blend_extracted/911 by Singer (2.82 packed).blend` (107MB). Está **"packed"** → las texturas van DENTRO del archivo, es **autocontenido** (no hace falta la carpeta Textures).
- `export_glb.py` (script de export con todos los ajustes: renombra materiales, normaliza Diffuse/Glossy→Principled, borra emblemas Singer + acrílico, reasigna piso).
- (opcional) `inspect*.py` para inspeccionar.

Transferencia: Google Drive / WeTransfer / Dropbox / USB. Para multi-PC frecuente conviene un repo aparte con **Git LFS** para el `.blend`.

El **código web** se baja de GitHub: `git clone https://github.com/5antuca/gerstnersinger911` → `npm install`.

## Setup en la otra PC
- Blender 4.x (se usó 4.5.3).
- Node 18+ (`npm install` en el repo web).
- gltf-transform vía `npx @gltf-transform/cli` (no requiere instalar).

## Flujo de trabajo
1. Abrir el `.blend` en Blender y editar (ej. butacas → colección `Recaro base`).
2. **MANTENER los nombres de material** (`Paint_ext`, `Fuchs_1/2/cap`, `Glass_ext`, `Headlamp_glass`, `Glass_orange/red/parking_light`, `Lamp_chrome`, `Brake_caliper`, `Brake_disc`, `Tire_*`/`Rubber`, `Carpet_*`, `Plastic_int_matt`, `Leather_*`, etc.). Conservar UVs.
3. Exportar (headless):
   ```
   /Applications/Blender.app/Contents/MacOS/Blender --background "RUTA/911 by Singer (2.82 packed).blend" --python export_glb.py -- "/ruta/singer_raw.glb"
   ```
   (Windows: `blender.exe --background "...blend" --python export_glb.py -- "C:\ruta\singer_raw.glb"`)
4. Optimizar para web:
   ```
   npx @gltf-transform/cli optimize singer_raw.glb step1.glb --compress false --texture-compress webp --simplify false --palette false --texture-size 4096 --join false --weld 0
   npx @gltf-transform/cli draco step1.glb singer_final.glb --quantize-normal 14 --quantize-position 16 --quantize-texcoord 14
   ```
5. Copiar `singer_final.glb` → `public/models/SingerClean.glb` del repo web. Ajustar `MODEL_URL` en `src/components/3d/Car.tsx` si cambia el nombre.
6. `npm run build` + `npm run dev` para probar. Si las butacas nuevas traen un material nuevo, agregar ese nombre a `FINISH_MATS`/`COLOR_MATS` en `Car.tsx` (1 línea).
7. `git commit` + `git push` → deploy live en studio.gerstnerwerks.com (Vercel).

## Recordar
- **Escala:** el pack viene en METROS → `SCALE = 1.0` en `Car.tsx`.
- **Grounding:** por material `Tire_base` (`FLOOR_MATS`).
- Copia de esta guía también queda al lado del `.blend` (`LEER_trabajar_en_otra_PC.md`).
