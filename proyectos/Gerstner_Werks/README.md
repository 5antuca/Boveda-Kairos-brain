# Proyecto: Gerstner Werks

Taller especializado en la **restauración y modificación de autos clásicos**. 
	Su mayor fuente de ingresos proviene de estas restauraciones y trabajos personalizados generales. Además, desarrollan **modificaciones de Porsche 911 clásicos (tipo Singer) y modelos similares (964, etc.)**, aunque esta división aún no es pública y está reservada exclusivamente para clientes muy selectos.

## Estructura del Proyecto

El ecosistema digital de Gerstner Werks se divide en dos componentes principales:

### 1. Gerstner Werks (Landing Page)
Sitio institucional principal que presenta la marca, los servicios de restauración y el portafolio de proyectos terminados.
- **Dominio**: [gerstnerwerks.com](https://gerstnerwerks.com/)
- **Repositorio**: [5antuca/gerstnerwerks5](https://github.com/5antuca/gerstnerwerks5.git)
- **Código fuente local**: `/Users/5an/Documents/gerstner page/gerstnerwerks5-main/`

### 2. Gerstner Studio (Configurador 3D)
Aplicación interactiva de alta fidelidad para la personalización técnica y estética de Porsche 911/964.
- **Dominio**: [studio.gerstnerwerks.com](https://studio.gerstnerwerks.com/)
- **Repositorio**: [5antuca/gerstnersinger911](https://github.com/5antuca/gerstnersinger911.git)
- **Código fuente local**: `/Users/5an/Documents/gerstnersinger911/`

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
  - `Aston Martin DB3`
  - `Aston Martin Vantage`
  - `Ferrari Dino`
  - `Ford Bronco`
  - `Jaguar e-type cabriolet`
- Si en Cloudinary se renombra una carpeta, actualizar `assets/projects.config.json` en la landing.

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
