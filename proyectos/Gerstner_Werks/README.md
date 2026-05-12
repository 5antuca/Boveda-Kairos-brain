# Proyecto: Gerstner Werks

Taller especializado en la **restauración y modificación de autos clásicos**. 
	Su mayor fuente de ingresos proviene de estas restauraciones y trabajos personalizados generales. Además, desarrollan **modificaciones de Porsche 911 clásicos (tipo Singer) y modelos similares (964, etc.)**, aunque esta división aún no es pública y está reservada exclusivamente para clientes muy selectos.

## Estructura del Proyecto (en el vault)

Esta carpeta documenta solamente la **landing institucional** del taller. Las herramientas internas (configurador 3D, Drive Assistant, futuras apps) viven bajo el paraguas [[../Gerstner_Studio/Gerstner_Studio|Gerstner Studio]].

### Gerstner Werks — Landing Page
Sitio institucional principal que presenta la marca, los servicios de restauración y el portafolio de proyectos terminados.
- **Dominio**: [gerstnerwerks.com](https://gerstnerwerks.com/)
- **Repositorio**: [5antuca/gerstnerwerks5](https://github.com/5antuca/gerstnerwerks5.git)
- **Código fuente local**: `/Users/5an/Documents/gerstner page/gerstnerwerks5-main/`

### Herramientas relacionadas (en otro folder del vault)
- **Configurador 3D Porsche 911** (`studio.gerstnerwerks.com`) → [[../Gerstner_Studio/Configurador_911/ROADMAP|ROADMAP]]
- **Drive Assistant** (`gerstnerwerks.ai`, en diseño 2026-05-09) → [[../Gerstner_Studio/Drive_Assistant/Drive_Assistant|Dashboard]]

### Docs técnicas de la landing
- [[logicaDeCargaFotosGalerias]] — Cómo funciona el skeleton+LQIP+blur-up y la precarga secuencial del lightbox (2026-05-12)

> Reorganización 2026-05-09: el subfolder `Gerstner_Studio/` que estaba acá adentro fue movido a `proyectos/Gerstner_Studio/Configurador_911/` para evitar la duplicación de nombres con el nuevo paraguas top-level.

---

## Media: Cloudinary (CDN de imágenes y videos)

Todos los **medios de la landing page** (fotos y videos del portfolio, hero carousel, galería) se alojan en **Cloudinary**. Esto incluye las 27 imágenes y videos del portfolio subidos en Mayo 2026.

### Credenciales de Cloudinary

| Campo | Valor |
|---|---|
| **Cloud Name / API Key** | `416726481519382` |
| **API Secret** | `2npxwTpzqMM3Uy2ukien4gOPkcM` |
| **URL base de assets** | `https://res.cloudinary.com/[cloud_name]/image/upload/` |
| **URL base de videos** | `https://res.cloudinary.com/[cloud_name]/video/upload/` |

> ⚠️ Las URLs de Cloudinary tienen el formato:
> `https://res.cloudinary.com/CLOUD_NAME/image/upload/TRANSFORMACIONES/PUBLIC_ID.ext`

### Por qué no se ven los medios en la web

**El problema está en el `index.html`**: las etiquetas `<img>` y `<video>` referencian los medios con **rutas locales relativas** (e.g. `src="img/galery/foto.webp"`), en lugar de apuntar a las URLs de Cloudinary.

**Para que los 27 medios aparezcan**, hay que reemplazar en el `index.html` todas las rutas locales del carrusel hero y la galería por las URLs de Cloudinary correspondientes. Ejemplo del cambio:

```html
<!-- ❌ ANTES (ruta local que no funciona en producción si el asset no está en el repo) -->
<img src="img/galery/rest_gallery/89938_35_11zon.webp">

<!-- ✅ DESPUÉS (URL de Cloudinary) -->
<img src="https://res.cloudinary.com/CLOUD_NAME/image/upload/v1/gerstnerwerks/89938_35_11zon.webp">
```

### Cómo obtener las URLs de los 27 assets subidos

1. Ir al **Media Library** de Cloudinary: [console.cloudinary.com](https://console.cloudinary.com/)
2. Hacer clic en un asset → botón **"Copy URL"** o ver el campo `public_id`
3. Reemplazar las rutas locales en el `index.html` con esas URLs

### Deploy de "Proyectos" (Cloudinary API) - Checklist y Troubleshooting

La sección `Proyectos` de la landing se genera en deploy desde la API de Cloudinary (no desde `image/list` público).

**Repositorio landing:** `5antuca/gerstnerwerks5`  
**Workflow:** `.github/workflows/deploy.yml`  
**Script generador:** `scripts/generate-projects-json.mjs`  
**Config de carpetas:** `assets/projects.config.json`  
**Salida generada:** `assets/projects.generated.json`

#### Secrets obligatorios en GitHub Actions

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `FTP_SERVER`
- `FTP_USERNAME` / usuario configurado en workflow
- `FTP_PASSWORD`

#### Error típico y causa

- `Missing Cloudinary credentials...`  
  Faltan uno o más secrets `CLOUDINARY_*` en `Settings -> Secrets and variables -> Actions`.

- `Invalid workflow file ... Unrecognized named-value: 'secrets'`  
  No usar `secrets.*` directo en `if:` de step; usar `env.*` a nivel job.

#### Verificación rápida post-deploy

1. En Actions, el step `Generate projects feed from Cloudinary API` debe terminar OK.
2. El log debe mostrar: `Generated X projects into assets/projects.generated.json`.
3. En la web, entre `Nosotros` y `Proveedores` deben verse las cards de `Proyectos`.
4. Hover sobre una card: rota imagen cada 3s y muestra overlay `Ver`.
5. Click en la card: abre lightbox con galería del proyecto.

#### Nota clave (evita secciones vacías)

- Para `Proyectos`, la generación debe filtrar por `asset_folder` (no por `prefix/public_id`).
- Carpetas verificadas actualmente:
  - `Porsche 964 Gerstner`
  - `Porsche 911 1965`
  - `Porsche 964 Targa`
  - `Porsche 911 Carrera`
  - `Porsche 993 Turbo`
  - `Porsche 911 Targa`
  - `Ferrari 488 Spider`
  - `Ferrari 488 GTB`
  - `Ferrari Dino`
  - `Jaguar E-Type 60s`
  - `Jaguar E-Type Cabriolet`
  - `Jaguar E-Type Roadster`
  - `Jaguar E-Type V12`
  - `Jaguar E-Type (1)`
  - `Aston Martin DB3`
  - `Aston Martin DB5`
  - `Aston Martin Vantage`
  - `Shelby Cobra 289`
  - `Shelby Cobra 427`
  - `shelby cobra 427 (1)`
  - `Ford Mustang Fastback 1966`
  - `Ford Mustang Fastback 1969`
  - `Ford Early Bronco`
  - `Ford SVT F150 Lightning`
  - `Mercedes-Benz 560 SL`
  - `Mercedes-Benz 230 SL`
  - `Ford Coupe 1938`
  - `Land Rover Defender 90`
  - `Land Rover`
  - `Camaro Z28`
  - `Maserati Ghibli Spyder`
  - `Torino 380 W`
  - `Chevrolet Corvette C1`
  - `Toyota Hilux Back to the Future 1 y 2`
  - `Toyota Hilux Competición`
  - `Toyota Hilux Rally`
  - `BMW De Carlo`
- Si en Cloudinary se añade una carpeta nueva, el script la detectará automáticamente si es de primer nivel. Si se necesita orden específico o cover manual, actualizar `assets/projects.config.json` en la landing.

#### Deploy Stability (DonWeb & FTP)

El servidor de **DonWeb** tiene límites estrictos de conexión y timeouts que suelen interrumpir el despliegue automático de GitHub Actions (Error: `Server sent FIN packet unexpectedly`).

Para garantizar un deploy exitoso, se han implementado las siguientes configuraciones en `.github/workflows/deploy.yml`:

1.  **Protocolo FTP Plano (`protocol: ftp`)**: Se ha encontrado que es más estable que FTPS para este proveedor específico, evitando fallos durante el handshake de seguridad.
2.  **Timeout Extendido (`timeout: 1800000`)**: Configurado en 30 minutos para permitir la subida lenta de todos los assets sin cortes prematuros.
3.  **Exclusiones de Sync**: Se excluyen carpetas como `.github`, `node_modules` y `scripts` para reducir drásticamente la cantidad de archivos y el tiempo de conexión.
4.  **Versión de Node**: Se utiliza **Node 24** para garantizar la compatibilidad total con la acción de FTP.

---

## Roadmap y Estado Actual (Studio)

Actualmente en **Fase de Refinamiento Visual y UX**.

### Logros Recientes
- **Visuales**: Implementación de ACESFilmic Tone Mapping y sistema de iluminación de estudio profesional (4 puntos de luz).
- **Layout**: Diseño basado en pestañas (General, Interior, Llantas, Escape) con transiciones suaves y desenfoque dinámico del fondo.
- **Interiores**: Sistema de galería 2D de alta resolución con efecto de crossfade sincronizado.
- **Performance**: Optimización de carga con Loading Screen minimalista vinculada al progreso real del modelo 3D (Drei `useProgress`).

### Próximos Pasos
- [ ] **Persistencia**: Implementar guardado de configuraciones (Fase 4 - MongoDB/Supabase).
- [ ] **Escape**: Finalizar la sección de configuración de sistemas de escape.
- [ ] **Mobile**: Optimizar los targets táctiles de la barra de navegación en resoluciones pequeñas.
- [ ] **Landing**: Actualizar `index.html` con las URLs de Cloudinary de los 27 medios subidos.

## Referencias Técnicas
- Configuración actual en [[Gerstner_Studio/ROADMAP]]
- Documentación del modelo en [[Gerstner_Studio/README]]
