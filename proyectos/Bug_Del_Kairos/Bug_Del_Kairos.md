---
tags: [bug-del-kairos, music, web, moc]
fecha-creacion: 2026-05-20
estado: en-diseño
dominio: bugdelkairos.com
---

# 🎵 Bug Del Kairos

Sitio web del proyecto musical personal **Bug Del Kairos**. Híbrido entre página informativa y reproductor tipo SoundCloud, con tienda integrada (MercadoPago) para descargar música y, a futuro, contenido inmersivo en VR (DeoVR API).

- 🌐 **Dominio**: [bugdelkairos.com](https://bugdelkairos.com) — ya comprado (2026-05-20)
- 📋 **Roadmap**: [[Roadmap]]
- 📊 **Estado actual**: dominio comprado, sin DNS ni hosting configurado. Pendiente landing "bug del kairos" como primer hito.

---

## 🎯 Visión

Plataforma propia bajo dominio único que reemplace la dependencia de SoundCloud/Bandcamp para distribuir el material del proyecto musical. Foco en control creativo, monetización directa y experiencias inmersivas (VR) que no son posibles en plataformas tradicionales.

### Pilares
1. **Reproductor de álbumes** — streaming en sitio, gratis, sin login.
2. **Tienda de descargas** — pagar para bajar el álbum/track. Precio inicial: **AR$ 555** por descarga, vía MercadoPago.
3. **VR / Inmersivo** — videos 360° / VR integrados con DeoVR API (visor compatible).
4. **Agenda de shows** — listado de fechas y venues próximos, con flyer e info.
5. **Releases** — anuncios de nuevos álbumes/singles/videos como blog posts cortos.

---

## 🗺️ Roadmap (alto nivel)

| Fase | Entregable | Estado |
|------|-----------|--------|
| **0** | Landing mínima en `bugdelkairos.com` con título "bug del kairos" | 🟡 a definir hosting |
| **1** | Estructura del sitio (home + secciones álbumes / shows / contacto) | ⬜ pendiente |
| **2** | Reproductor de audio (1 álbum demo) | ⬜ pendiente |
| **3** | Integración MercadoPago — checkout descarga AR$ 555 | ⬜ pendiente |
| **4** | Sección shows con fechas administrables | ⬜ pendiente |
| **5** | Videos VR — embed DeoVR API | ⬜ pendiente |
| **6** | CMS / panel admin para subir álbumes y fechas sin tocar código | ⬜ pendiente |

Ver detalle en [[Roadmap]].

---

## 🔧 Stack (a definir)

Pendiente decisión — opciones a evaluar:
- **Static + serverless**: Next.js / Astro en Vercel, audio en R2/S3, MercadoPago via API.
- **VPS Kairos**: container Docker en el mismo VPS bajo Traefik, junto a los otros servicios.
- **Híbrido**: frontend en Vercel, backend (catálogo + pagos + webhooks MP) en VPS.

---

## 🔗 Relación con otros proyectos

Proyecto **personal** del usuario (no de Kairos AI Solutions). Comparte VPS y aprendizajes de stack con [[Gerstner_Studio]] y [[LangGraph_Bot]], pero es independiente comercialmente.
