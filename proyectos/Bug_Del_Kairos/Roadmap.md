---
tags: [bug-del-kairos, roadmap]
fecha-creacion: 2026-05-20
---

# Roadmap — Bug Del Kairos

Volver a [[Bug_Del_Kairos]].

---

## Fase 0 — Landing "bug del kairos" 🟡

**Objetivo**: que entrar a `bugdelkairos.com` muestre el texto "bug del kairos" (placeholder mientras se construye el sitio real).

Decisiones pendientes antes de codear:
- **Hosting**: ¿Vercel (deploy con `vercel deploy`, dominio apunta ahí) o VPS Kairos (container Docker bajo Traefik, igual que `ai.kairosaisolutions.com`)?
- **Tipo de archivo**: ¿HTML estático mínimo o ya armar la base Next.js/Astro para crecer encima?
- **Estética**: ¿blanco sobre negro tipográfico, glitch art, logo, nada (solo texto)?

Pasos cuando se elijan las opciones:
1. Crear proyecto en `/root/apps/bugdelkairos/` (o repo en GitHub).
2. Apuntar DNS de `bugdelkairos.com` al hosting elegido.
3. Configurar SSL (Vercel automático / Traefik con Let's Encrypt si VPS).
4. Deploy y verificación.

---

## Fase 1 — Estructura del sitio ⬜

Secciones esperadas:
- **Home** — hero con nombre del proyecto, último release destacado, próximo show.
- **Música** — listado de álbumes con cover, año, reproductor.
- **Shows** — calendario de fechas próximas + archivo de pasadas.
- **Videos** — galería de videoclips y/o contenido VR.
- **Contacto** — booking, prensa, redes.

---

## Fase 2 — Reproductor de audio ⬜

- Reproducción en stream (no descarga directa).
- Storage del audio: candidatos = Cloudflare R2, S3, o VPS local.
- Formato: MP3 192kbps para stream, WAV/FLAC reservados para descargas pagas.
- Player custom (HTML5 audio + UI propia) o librería (Wavesurfer.js, Howler).

---

## Fase 3 — MercadoPago checkout ⬜

- Precio inicial: **AR$ 555** por descarga (álbum o track — definir granularidad).
- Integración: SDK MercadoPago + webhook `payment.created` → genera link de descarga firmado con TTL corto (ej. 24h).
- Almacenamiento de pedidos en DB (Postgres en VPS o Supabase).
- Email al comprador con el link de descarga.

Preguntas abiertas:
- ¿Solo MercadoPago o también tarjeta internacional (Stripe / PayPal)?
- ¿Cuenta de MP personal o crear cuenta empresa para Bug Del Kairos?
- ¿Granularidad: track individual vs álbum completo vs ambos?

---

## Fase 4 — Sección shows ⬜

- Listado simple con: fecha, hora, venue, ciudad, link a entradas, flyer.
- CRUD desde panel admin (Fase 6) o JSON commiteado al repo.

---

## Fase 5 — Videos VR (DeoVR API) ⬜

- Investigar DeoVR API: ¿qué formato esperan? ¿Self-host del video o hosted en DeoVR?
- Embed compatible con visores VR (Quest, Pico, etc.) y fallback en navegador desktop.
- Volumen de storage estimado a definir.

---

## Fase 6 — CMS / Panel admin ⬜

Que el usuario pueda subir álbumes, shows y videos sin tocar código.
- Opciones: Sanity, Strapi, Directus, o admin custom propio.
- Auth: login simple solo para el usuario (no multi-user).
