# ROADMAP — Swap del modelo 3D al Porsche Singer (AutoCAD → web)

> [!abstract] Objetivo
> Reemplazar el modelo gratuito del **Porsche 911 Turbo** (`Porsche911.glb`) por el **Porsche 964 "Singer" propio** (modelado en AutoCAD, hoy sin texturas ni colores), con calidad **fotorrealista**, pudiendo **viajar por el interior** y **abrir capó / tapa de motor / puertas**.

Relacionado: [[README]] · [[ROADMAP]] (roadmap general del configurador).
Fecha: 2026-05-22.

---

## 0. Estado real del configurador (auditoría del repo `gerstnersinger911`)

> [!info] Lo que YA existe
> - Stack: **Next.js + React Three Fiber + drei + Three.js**, glTF con **Draco + KTX2**. Deploy pensado para VPS Kairos (Docker) + Vercel.
> - `src/components/3d/Car.tsx` lo **autogenera `gltfjsx`** desde el `.glb`.
> - Configurador (Zustand) maneja **color de pintura** (material `paint`) y **llantas** (material `930_rim`: color/metalness/roughness).
> - Escena: `OrbitControls` exterior, `ContactShadows`, `Environment`.

> [!warning] Lo que NO está hecho (aunque el README lo promete)
> - **Interior NO conectado**: el store lee `interiorColor` pero el código no lo aplica ("falta identificar el nodo de las butacas").
> - **Aperturas (puertas/capó) NO implementadas** — y el modelo 911 actual **no se podría abrir** igual: sus piezas tienen nombres genéricos (`Object_4`, `Object_11`…) y no tienen pivotes ni animaciones.
> - La cámara **no entra** al interior (`OrbitControls` con ángulo polar limitado).
> - La escena usa `Environment preset="city"` de drei — **no** está cargando el HDR de `public/env/`.

### El "contrato" del modelo
El configurador NO engancha por nombre de pieza (son genéricos), sino por **nombre de MATERIAL**. El 911 actual expone: `paint`, `coat`, `930_rim`, `930_tire`, `glass`, `black`, `930_chromes`, `930_lights`, `930_plastics`, `930_stickers`, `930_lights_refraction`, `plate`, `930_wunderbaum`, `material_0` (plano de sombra que se oculta).

> [!important] Conclusión
> El modelo Singer, **si se autora bien**, desbloquea todo lo que promete el README. La clave está 100% en **cómo se entrega el GLB**.

---

## 1. INCÓGNITA QUE GATEA TODO: ¿qué es el archivo de AutoCAD?

- [ ] Determinar en AutoCAD (Visual Style *Realistic* + orbitar, o comando `LIST`):
  - **Superficies / sólidos** (`3DSOLID`/`SURFACE`/`MESH`) → el AutoCAD se exporta (FBX/OBJ) y se limpia.
  - **Solo trazados** (`LINE`/`SPLINE`/`POLYLINE`) → no hay superficie; el AutoCAD es **referencia de medidas** y el auto se **re-modela en SubD** (lo normal para fotorrealismo de pintura).
- [ ] Confirmar si el **interior está modelado** (butacas, tablero) o solo la carrocería.

---

## 2. Spec del `PorscheSinger.glb` (deliverable para el artista 3D / Blender)

> [!note] Formato y transform
> - glTF 2.0 **binario** (`.glb`), geometría **Draco**, texturas **KTX2/Basis** (así lo cargan los loaders actuales).
> - Y-up, escala **real en metros**, centrado en el piso, frente hacia **+Z**.

### Materiales (nombres semánticos — el código se adapta a estos)
- `paint` → `MeshPhysicalMaterial` con **clearcoat** (el color/flakes lo maneja el configurador en vivo; **no** hornear el color final).
- `rim`, `tire`, `glass` (con transmission), `chrome`, `plastic_black`, `lights`, `lights_refraction`.
- Interior (hoy faltante): `interior_leather` / `interior_cloth`, `interior_plastic`, `dash`, `carbon`.
- UVs en TODO + mapas PBR (base color, metallic, roughness, normal) + **AO horneado**.

### Partes separadas, nombradas y con PIVOTE en la bisagra (para abrir)
- `Hood` (capó delantero / frunk), `EngineLid` (tapa motor trasera — **el 964 es motor atrás**), `Door_L`, `Door_R`, `Wheel_FL/FR/RL/RR`, `SteeringWheel`.
- **Interior modelado** (butacas, tablero, consola) con sus materiales → habilita el selector de interior y el viaje de cámara.

### Presupuesto (photoreal pero web)
- Carrocería limpia (idealmente derivada de **SubD** para reflejos prolijos).
- Total ~**300–800k tris**, texturas **2K–4K** KTX2, LODs opcionales. Objetivo de carga fluida (<15–25 MB con compresión).

---

## 3. Fases de ejecución

### Fase A — Producción del asset (el 80% del esfuerzo; artista 3D / Blender)
- [ ] Resolver incógnita §1 y exportar/llevar a Blender (o re-modelar en SubD usando el AutoCAD de referencia).
- [ ] Retopo/limpieza, normales, escala, separar+pivotear partes móviles (§2).
- [ ] UVs + materiales PBR + bake AO; modelar/texturizar interior.
- [ ] Exportar `PorscheSinger.glb` (Draco + KTX2) según la spec §2.

### Fase B — Integración exterior (web; lo hace Claude)
- [ ] `npx gltfjsx public/models/PorscheSinger.glb -o src/components/3d/Car.tsx -t`.
- [ ] Re-mapear referencias de materiales (paint/rim) a los nombres del Singer.
- [ ] Cargar **HDRI de estudio real** (`<Environment files=...>`) + tunear luces/ContactShadows → fotorrealismo.
- [ ] Validar look (reemplaza al 911). *Gate: si no convence acá, parar.*

### Fase C — Aperturas
- [ ] Animaciones **GSAP** de `Door_L/R`, `Hood`, `EngineLid` rotando sobre su pivote (click-to-open).
- [ ] Hotspots/botones en la UI para abrir/cerrar.

### Fase D — Interior
- [ ] Conectar `interiorColor` al material `interior_*` (hoy roto).
- [ ] Cámara "entrar al interior": waypoints/tween (GSAP) + relajar `OrbitControls` (quitar límite polar al entrar).

### Fase E — Configurador completo + deploy
- [ ] Llantas/materiales/colores Singer (ampliar presets del store).
- [ ] Dockerizar y deployar al **VPS Kairos** (ruta Traefik, como `ai-gerstner`).
- [ ] Persistencia MongoDB (Fase 4 del [[ROADMAP]] general): guardar config por cotización + URL compartible.

---

## 4. División de trabajo
- **Artista 3D / Blender (o vos):** Fase A — el asset fotorrealista (modelado, UVs, texturas, separar partes, interior). Es el cuello de botella real.
- **Claude (web):** Fases B–E — integración R3F, aperturas GSAP, cámara interior, HDRI, configurador, dockerizar/deploy.

## 5. Quick wins (se pueden adelantar sin el modelo)
- [ ] Cargar el HDRI real + tunear iluminación/sombras.
- [ ] Dejar **scaffolding** de interior-color y aperturas (con nombres placeholder) para enchufar al llegar el GLB.

> [!todo] Próximo paso
> 1. Capturas del AutoCAD orbitando en *Realistic* → confirmar §1.
> 2. Decidir artista 3D vs Blender propio para Fase A.
