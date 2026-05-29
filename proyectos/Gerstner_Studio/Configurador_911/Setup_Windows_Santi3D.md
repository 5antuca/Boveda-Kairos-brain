---
tags: [gerstner-studio, configurador-911, blender, workflow, windows, setup]
fecha: 2026-05-29
relacionado: "[[Trabajar_blend_en_otra_PC]]"
---

# Setup Windows — Seguir el 3D en otra PC (`Santi 3D`)

> Adaptación a **Windows** de [[Trabajar_blend_en_otra_PC]] (la original es para Mac).
> PC nueva: usuario `toroj`. El kit llega como `gerstner_blender_kit.zip` en `Downloads`.
> Look + pipeline completo en [[SPEC_Photoreal_Pipeline]] · [[ROADMAP_Fase3_Photoreal]].

## Concepto clave (no olvidar)
Hay DOS partes separadas:
1. **El 3D base** → se edita en **Blender** (geometría, UVs, butacas, materiales base). Vive en el `.blend` (NO está en git, pesa ~107MB; viaja en el zip).
2. **El "look" cinematográfico** (pintura metálica, iluminación de estudio, cámara, colores de llantas/escape/vidrios) → vive en el **código web** (`gerstnersinger911`, en GitHub) y se aplica en runtime **por NOMBRE de material**.

➡️ En Blender se trabaja geometría/materiales base; el render final lo hace la web sola, **siempre que se respeten los nombres de material**.

## 1. Armar la carpeta y clonar (PowerShell)
```powershell
cd $HOME\Documents
mkdir "Santi 3D"; cd "Santi 3D"

# Repos desde GitHub
git clone https://github.com/5antuca/Boveda-Kairos-brain.git
git clone https://github.com/5antuca/gerstnersinger911.git

# Descomprimir el kit de Blender
Expand-Archive -Path "$HOME\Downloads\gerstner_blender_kit.zip" -DestinationPath ".\gerstner_blender_kit"
```
Resultado en `Documents\Santi 3D\`:
- `Boveda-Kairos-brain\` (la bóveda / esta doc)
- `gerstnersinger911\` (código web del configurador)
- `gerstner_blender_kit\` (el `.blend` packed + `export_glb.py` + scripts/guía)

> Verificá qué trajo el zip: `dir ".\gerstner_blender_kit" -Recurse | Select-Object FullName`.
> Debería estar el `.blend` (`911 by Singer (2.82 packed).blend`, ~107MB) y `export_glb.py`.
> Si el `.blend` viene como zip anidado (`911_blend_2.82_packed.zip`), descomprimilo también.

## 2. Instalar dependencias (una vez)
- **Blender 4.x** (la PC `toroj` tiene **4.4**; en Mac se usó 4.5.3 — ambas sirven) →
  el `.exe` real (NO el acceso directo `.lnk`) queda en
  `C:\Program Files\Blender Foundation\Blender 4.4\blender.exe`.
  > El acceso directo del menú inicio (`...\Start Menu\Programs\Blender\Blender 4.4.lnk`) abre la GUI,
  > pero para el export headless hay que llamar al `blender.exe` de arriba.
- **Node 18+** → https://nodejs.org/ (incluye `npm` y `npx`). Verificá: `node -v`.
- **git** (ya lo tenés si clonaste). `gltf-transform` NO se instala: se usa con `npx`.

Setup del repo web:
```powershell
cd "$HOME\Documents\Santi 3D\gerstnersinger911"
npm install
```

## 3. Flujo de trabajo (Blender → web)
1. Abrir el `.blend` en Blender y editar (ej. butacas → colección **`Recaro base`**, 38 mesh).
2. **MANTENER los nombres de material** (clave para que el código aplique el look):
   `Paint_ext`, `Fuchs_1`/`Fuchs_2`/`Fuchs_cap`, `Glass_ext`, `Headlamp_glass`,
   `Glass_orange`/`Glass_red`/`Glass_parking_light`, `Lamp_chrome`, `Brake_caliper`,
   `Brake_disc`, `Tire_*`/`Rubber`, `Carpet_*`, `Plastic_int_matt`, `Leather_*`, etc.
   **Conservar UVs** (sin UV no entran texturas).
3. **Exportar** headless (PowerShell, una sola línea):
   ```powershell
   & "C:\Program Files\Blender Foundation\Blender 4.4\blender.exe" --background `
     "$HOME\Documents\Santi 3D\gerstner_blender_kit\911 by Singer (2.82 packed).blend" `
     --python "$HOME\Documents\Santi 3D\gerstner_blender_kit\export_glb.py" -- `
     "$HOME\Documents\Santi 3D\gerstner_blender_kit\singer_raw.glb"
   ```
   (Ajustá las rutas al nombre real que haya quedado tras descomprimir.)
4. **Optimizar para web** (gltf-transform vía npx, desde la carpeta del kit):
   ```powershell
   cd "$HOME\Documents\Santi 3D\gerstner_blender_kit"
   npx @gltf-transform/cli optimize singer_raw.glb step1.glb --compress false --texture-compress webp --simplify false --palette false --texture-size 4096 --join false --weld 0
   npx @gltf-transform/cli draco step1.glb singer_final.glb --quantize-normal 14 --quantize-position 16 --quantize-texcoord 14
   ```
   Target < 25MB (la corrida de referencia dio ~21MB).
5. **Copiar** el GLB al repo web y apuntar el loader:
   ```powershell
   copy singer_final.glb "$HOME\Documents\Santi 3D\gerstnersinger911\public\models\SingerClean.glb"
   ```
   Si cambiás el nombre, ajustar `MODEL_URL` en `src\components\3d\Car.tsx`.
6. **Probar**:
   ```powershell
   cd "$HOME\Documents\Santi 3D\gerstnersinger911"
   npm run build
   npm run dev   # http://localhost:3000
   ```
   Si las butacas nuevas traen un material nuevo, agregar ese nombre a `FINISH_MATS`/`COLOR_MATS` en `Car.tsx` (1 línea).
7. **Deploy** (cuando convenza): `git commit` + `git push origin main` → Vercel publica LIVE en **studio.gerstnerwerks.com**. SIEMPRE `npm run build` antes de pushear.

## Recordar (reglas duras)
- **Escala:** el pack viene en METROS → `SCALE = 1.0` en `Car.tsx` (NO `0.0254`).
- **Grounding:** por material `Tire_base` (`FLOOR_MATS`).
- **Color de pintura siempre dinámico** (feature del configurador, viene del store).
- El `.blend` está **"packed"** → texturas adentro, autocontenido (no hace falta carpeta Textures aparte).
- El GLB se commitea a git (Vercel lo sirve de `/public`) → vigilar tamaño < 25MB.

## Pendientes abiertos para Blender (Fase 2)
- **Bake de procedurales** (`Plexi_bubbles`, `Internals`, `Radiator`, reflectores de luces) → mata el verde del acrílico y baja z-fighting.
- **Convertir Diffuse/Glossy → Principled** en el `.blend` (hoy lo hace `export_glb.py`; mejor de origen) → elimina los "blancos" del interior.
- **UV de tapas oil/fuel** (`Sphere.000`/`Sphere.026`): centrar el label FUEL/OIL en el domo.
- **Guardabarros delantero izq.**: deformidad introducida por el export (`weld`/`apply_modifiers`/draco) — re-export con `--weld 0` (ya aplicado arriba) y verificar.
- **Z-fighting** en llantas Fuchs y ópticas/faros: offset de caras coplanares en geometría.
- **Puerta del conductor** modelada ABIERTA (~70°) en el pack: decidir si cerrarla por default.
