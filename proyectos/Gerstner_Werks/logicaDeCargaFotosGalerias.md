---
tags: [gerstner-werks, landing, performance, ux, cloudinary]
fecha: 2026-05-12
relacionado: [[README]]
---

# Lógica de carga de fotos en galerías — Gerstner Werks

Documenta cómo se cargan las imágenes en la landing `gerstnerwerks.com`, los estados visuales que ve el usuario, y por qué cada decisión está donde está. Útil cuando haya que tocar cualquier galería o lightbox a futuro.

> **Implementado en**: rama `feature/gallery-loading-ux` (PR `5antuca/gerstnerwerks5#…`), commits `8e5171b` + `74dec40`, 2026-05-12.
> **Spec original**: `kairos-infrastructure/specs/2026-05-12-gerstnerwerks-galleries-loading.md`

---

## TL;DR

1. **Cloudinary** sirve todas las fotos/videos. Las URLs ahora usan `f_auto,q_auto` → Chrome recibe AVIF, Safari WebP, ~25% menos peso que `f_webp` fijo.
2. **Skeleton shimmer** aparece <50ms en el slot vacío, antes incluso del LQIP.
3. **LQIP (Low Quality Image Placeholder)** de ~1-3KB carga en <300ms y se ve borroso pero entrega contexto visual inmediato.
4. **Medium** (~800px, ~50-90KB) reemplaza al LQIP cuando termina de bajar → imagen nítida.
5. **Full-res** (original) carga silenciosamente en background después del medium (solo en el lightbox).
6. En el **lightbox**, las imágenes precargan **en orden, una a la vez, arrancando por la que el usuario está mirando**. La #1 se lleva el 100% del ancho de banda. Mientras el usuario observa, las siguientes cargan en cola.

---

## Galerías afectadas

| Galería | Selector DOM | Resolución target | Cómo se hidrata |
|---|---|---|---|
| **Project card portada** | `.project-card-image` | `w_600` | Por JS dinámico al construir cards desde `assets/projects.generated.json` |
| **Carrusel galería principal** (visible) | `.gallery-carousel .carousel-slide img` | `w_500` | `hydrateImages()` al `DOMContentLoaded` |
| **Gallery data track** (fuente del lightbox de galería) | `#gallery-data-track img` | `w_800` | `hydrateImages()` al `DOMContentLoaded` |
| **About grid** | `.about-img-wrapper img` | `w_1000` | `hydrateImages()` al `DOMContentLoaded` |
| **Lightbox abierto** | `.lightbox-strip img` | `w_800` (medium), luego full | `lbStartMassPreload(priorityIdx)` al abrir |
| **Clones del carrusel infinito** | `.carousel-track .carousel-slide img` (segunda mitad) | `w_500` | Re-hidratación dentro de `setupGalleryClones()` |

> El **hero** (`#hero-media-container`) se popula dinámicamente y ya tiene `<link rel="preload" fetchpriority="high">` en `index.html`, así que se queda fuera de `hydrateImages()`.

---

## Helpers JavaScript (`script.js`, líneas 1-104)

### `replaceCloudinaryTransformations(url, newTransforms)`
Pega un bloque de transformaciones nuevo a una URL de Cloudinary. Si la URL ya traía transformaciones (segmento con coma o prefijos `q_`, `w_`, `f_`, `c_`, `e_`), las reemplaza. Si no era de Cloudinary, la devuelve intacta.

### Las 4 versiones de una imagen

```js
makeLqipUrl(url)           // w_30,e_blur:1500,f_webp,q_20   → ~1-3KB
makeAutoUrl(url, width)    // f_auto,q_auto,c_limit,w_${w}   → AVIF/WebP adaptativo
makeMediumUrl(url)         // f_auto,q_auto,c_limit,w_800    → calidad lightbox
makeCardUrl(url)           // f_auto,q_auto,c_limit,w_600    → portadas de proyecto
```

**LQIP usa `f_webp` fijo** (no `f_auto`) porque queremos compresión predecible y el blur lo hace irrelevante. Las otras usan `f_auto,q_auto` para que Cloudinary elija el mejor formato/calidad por dispositivo.

### `applyBlurUp(imgEl, fullSrc, targetSrc, opts)`

El corazón del blur-up. Idempotente (`data-gw-hydrated="1"` lo marca, no se ejecuta dos veces sobre el mismo `<img>`).

Flujo:
1. Marca el slot contenedor con `.gw-skeleton` (shimmer gris animado).
2. Inyecta el LQIP en `<img>.src` + clase `.gw-lqip-loading` (filter blur fuerte + scale 1.06).
3. Precarga `targetSrc` (medium o card) en un `new Image()` paralelo.
4. Al `onload`: cambia `<img>.src` a `targetSrc`, quita `.gw-lqip-loading`, agrega `.gw-lqip-loaded` (transition de filter+transform 0.6s).
5. Al `onerror`: fallback al `fullSrc` original sin transformaciones.

Si la URL no es de Cloudinary (no se puede transformar a LQIP), salta directo al paso 3-4 sin pasar por blur. Graceful degradation.

### `hydrateImages(selector, targetWidth)`

Recorre todos los `<img>` del selector, guarda el `src` original en `data-original-src`, y aplica `applyBlurUp` con `makeAutoUrl(original, targetWidth)` como target.

**Por qué `data-original-src`**: porque después del blur-up, el `<img>.src` está apuntando al medium o LQIP. Si después necesitamos el src original (ej. al armar el strip del lightbox), tenemos que leerlo del dataset, no del atributo `src`.

### `getOriginalSrc(imgEl)`

Helper que devuelve `imgEl.dataset.originalSrc` si existe, sino `imgEl.getAttribute('src')`. Lo usa el lightbox para no agarrar el LQIP por error.

---

## Estados visuales (CSS)

`style.css` (al final del archivo):

```css
.gw-skeleton          /* shimmer gris animado 1.6s linear infinite */
.gw-lqip-loading      /* filter: blur(14px) brightness(0.92), scale(1.06) */
.gw-lqip-loaded       /* filter: blur(0), scale(1), transition 0.6s */
```

Y `@media (prefers-reduced-motion: reduce)` desactiva el shimmer + transitions para accesibilidad.

> **Compatibilidad legacy**: las clases `.lqip-loading` / `.lqip-loaded` específicas de `.project-card-image` siguen existiendo en CSS por si quedó código viejo, pero las nuevas las cubren genéricamente.

---

## Lightbox — precarga inteligente

### El problema original

La versión anterior tenía dos defectos:
1. La barra de progreso (`.lb-progress-bar`) animaba 0→90% en 4s **por CSS time-based**, sin relación con el progreso real. Si la imagen pesaba y tardaba 6s quedaba clavada al 90%; si cargaba en 500ms daba un snap raro.
2. Al abrir, las N imágenes del lightbox se precargaban **en paralelo** vía `new Image()`. El browser distribuía banda entre todas, y la imagen #1 (la que el usuario está viendo) llegaba al mismo ritmo que la #N.

### Solución actual (`lbStartMassPreload(priorityIdx)` en script.js)

**Orden de prioridad circular**:
```js
const order = [];
for (let offset = 0; offset < imgs.length; offset++) {
  order.push((priorityIdx + offset) % imgs.length);
}
// ej. con 12 imgs y priorityIdx=0: [0,1,2,3,4,5,6,7,8,9,10,11]
// ej. con 12 imgs y priorityIdx=5: [5,6,7,8,9,10,11,0,1,2,3,4]
```

**Concurrencia = 1**: cada `new Image()` empieza recién cuando el anterior dispara `onload` o `onerror`. La #1 se lleva el 100% del ancho de banda. Mientras el usuario observa, la #2 carga, después la #3, etc.

**Hint extra al browser**: la primera precarga lleva `fetchPriority="high"` (Chrome/Edge respetan, Safari ignora silently).

**Contador honesto**:
- `lbLoadedCount` se incrementa en cada `onload`/`onerror`.
- `lbUpdateProgress()` setea `.lb-progress-bar` width = `(loadedCount/total)*100%` y el texto del `#lb-counter` (ej. "Cargando 3 / 12" → "12 / 12 listas").
- Cuando `loadedCount === total`, agrega `.lb-fully-loaded` al lightbox → contador y barra hacen fade-out con `opacity 0.6s`.

### Por qué secuencial y no concurrencia 2-3

Tradeoff: concurrencia 1 = primera imagen máximo rápido, pero #12 tarda más. Concurrencia 3 = más throughput total, pero #1 más lenta.

**Decisión** (santi, 2026-05-12): en una galería de proyecto el usuario **se va a tomar tiempo observando cada foto**, así que vale la pena darle a la #1 el 100% del ancho de banda. Para cuando llegue a la #12 ya está cargada hace rato. Concurrencia 1 gana.

### Edge case: navegación rápida con prev/next

Si el usuario salta de #1 a #5 mientras la cola va por la #2, `loadImage(5)` dispara su propio `new Image()` para la #5 → el browser carga en paralelo con la #2 actual. Un par de segundos de banda compartida, no se aborta nada (`new Image()` no soporta abort limpio). Trade-off aceptado para v1.

---

## El flujo completo de abrir un proyecto

1. Click en `.project-card-media`.
2. `openLightbox(mediaEl)` detecta `dataset.projectMedia` (JSON con todas las URLs full-res del proyecto, generado en build por `scripts/generate-projects-json.mjs`).
3. Construye los `.lightbox-slide`:
   - Para cada imagen: crea `<img data-src="${full}" src="${LQIP}">` con clase blur fuerte.
   - Para cada video: crea `<video data-src="${full}">` sin autoplay todavía.
4. `showLightboxAt(0)`:
   - Resetea contador y barra a 0.
   - **`lbStartMassPreload(0)`** arranca la cola secuencial desde la imagen 0.
   - `loadImage(0)` hace su propio LQIP→medium→full progresivo del current slide (el browser dedupea la request porque comparte URL con la cola).
5. El usuario ve: shimmer gris (50ms) → LQIP borroso (200-400ms) → imagen nítida (~1-2s con `f_auto`).
6. Mientras la mira, la #2 y siguientes cargan en orden. Contador abajo: "Cargando 3 / 12" → ... → "12 / 12 listas" → fade out.
7. Click en Next: `goTo(1)`, `loadImage(1)` que ya tiene la imagen lista en cache → swap instantáneo.

---

## Carrusel infinito — caso especial de clones

`setupGalleryClones()` clona los slides del carrusel para hacer el loop infinito visual. Problema: `cloneNode(true)` copia también `data-gw-hydrated="1"`, así que los clones quedaban sin hidratar y mostraban el medium estático sin shimmer/blur-up al re-entrar.

**Fix**: dentro del `setupGalleryClones()`, después de clonar, recorremos los clones y:
1. Borramos `data-gw-hydrated` y las clases `.gw-lqip-loaded` / `.gw-lqip-loading`.
2. Re-llamamos `applyBlurUp(img, originalSrc, makeAutoUrl(originalSrc, 500))` con el dataset original (que sí se preserva en el clone).

Resultado: los clones se comportan igual que los originales.

---

## Cloudinary — qué URLs sirve cada cosa

Ejemplo real: foto del proyecto Aston Martin DB3, URL base:
```
https://res.cloudinary.com/dttrfxbio/image/upload/v1778133198/WhatsApp_Image_2026-05-06_at_19.17.32_jcx1wr.jpg
```

| Variante | URL transformada | Tamaño aprox |
|---|---|---|
| LQIP | `…/image/upload/w_30,e_blur:1500,f_webp,q_20/v1778133198/…jpg` | ~1.5KB |
| Card (`makeCardUrl`) | `…/image/upload/f_auto,q_auto,c_limit,w_600/v1778133198/…jpg` | ~30-60KB |
| Medium (`makeMediumUrl`) | `…/image/upload/f_auto,q_auto,c_limit,w_800/v1778133198/…jpg` | ~50-90KB |
| Auto custom (`makeAutoUrl`) | `…/image/upload/f_auto,q_auto,c_limit,w_${N}/v1778133198/…jpg` | depende |
| Full | (sin transforms) | original — varía |

**Verificación**: en DevTools Network panel, los hits a `res.cloudinary.com` desde Chrome deben responder `content-type: image/avif`. Desde Safari, `image/webp`. Si todavía responde `image/jpeg`, la URL no se transformó (probablemente no llevaba prefix `image/upload/` o ya tenía un version raw como `/v178…/` y el helper la dejó intacta — comportamiento esperado para iconos/PNG con `removebg`).

---

## Credenciales / config relacionada

- Cloudinary cloud name: `dttrfxbio` (no confundir con el cloud name viejo `416726481519382` que aparece en el README de `Gerstner_Werks/README.md` — ese es el **API Key**).
- Repo: `5antuca/gerstnerwerks5`.
- Deploy: GitHub Actions → FTP a DonWeb (workflow `.github/workflows/deploy.yml`).
- Carpetas de proyectos en Cloudinary se listan en `assets/projects.config.json`.

---

## Métricas esperadas vs. anteriores

| Métrica | Antes | Después |
|---|---|---|
| Peso medio de imagen (lightbox) | ~80KB (WebP fijo) | ~55KB (AVIF en Chrome moderno) |
| Tiempo hasta ver "algo" en cada slot | ~500ms (LQIP solo en project cards) | ~50ms (skeleton) → ~300ms (LQIP universal) |
| Tiempo hasta primera imagen nítida del lightbox abierto | ~3-5s con N=12 (paralelo) | ~700ms-1.5s con N=12 (secuencial, banda 100% en la #1) |
| Feedback de progreso | Barra falsa 0→90% en 4s | Barra real + contador "X / Y" |

---

## Cómo extender o tocar esto

### Agregar una galería nueva

1. En `index.html`, asegurate que las imágenes tengan src de Cloudinary con `f_auto,q_auto` (o transformación válida).
2. En `script.js`, agregar una línea al bloque de hidratación inicial:
   ```js
   hydrateImages('#mi-nuevo-selector img', anchoTargetEnPx);
   ```
3. En `style.css`, si el contenedor necesita `aspect-ratio` o `background-color: #1a1a1a`, definirlo para que el skeleton se vea ocupando espacio.

### Cambiar el formato de la URL Cloudinary

Tocar los helpers en `script.js:6-104`. Si cambia el patrón de las transformaciones, también revisar el regex en `replaceCloudinaryTransformations` (línea ~14) — actualmente detecta segmentos con coma o que arrancan con `q_`, `w_`, `f_`, `c_`, `e_`. Si se agrega un nuevo prefijo (ej. `b_` para background), agregarlo a la regex.

### Cambiar concurrencia de precarga del lightbox

En `lbStartMassPreload`, la línea `return; // Esperamos al callback (concurrencia = 1)`. Para concurrencia N, reemplazar por un pool: arrancar N llamadas a `loadNext()` antes del primer `return` y dejar que cada onload re-llame `loadNext()`. **Antes de subir a N>1**: medir si vale la pena — actualmente santi prefiere la #1 prioritaria.

### Debug

- Inspeccionar el `<img>` en DevTools y leer `data-original-src` y `data-gw-hydrated`.
- En la consola: `document.querySelectorAll('[data-gw-hydrated="1"]').length` para contar imágenes hidratadas.
- Si una imagen muestra shimmer eterno: chequear que la URL base sea Cloudinary y que el `new Image()` del medium no haya tirado `onerror` (Network panel).

---

## Decisiones que NO se tomaron (y por qué)

- **Pool de concurrencia de N imágenes**: descartado porque santi prefiere priorizar la #1 al máximo. Reconsiderar si en analytics aparecen abandons mientras esperan la primera carga.
- **Service Worker para cache offline**: fuera de scope. La landing no necesita funcionar offline.
- **Cambiar `<img src>` a `<img data-src>` en HTML**: descartado por riesgo de romper SEO + necesidad de JS sí o sí. Dejamos el `src` original como fallback; hay un flash <100ms del original antes de que `applyBlurUp` lo reemplace con el LQIP, aceptable.
- **AbortController para cancelar precargas al hacer prev/next rápido**: `new Image()` no lo soporta limpio. Para v1 aceptamos que ocasionalmente dos descargas compitan por unos segundos.
