# FangioCRM — Overhaul de UI + Demo del Agente (2026-05-24/25)

> Rework visual completo de la app pública (landing, auth, dashboard) a una estética
> **grafito + glass + minimalista** y construcción de una **demo del agente en vivo**.
> Todo LIVE en `www.fangiocrm.com` (Vercel, deploy automático en push a `main`).
> Repo: `github.com/5antuca/FangioCRM` (clone en `/root/apps/FangioCRM`, NO en el VPS de bots).

## Estética canónica (aplicar a futuras pantallas)
- Predominan **gris / negro (gris oscuro) / blanco / blanco-luz / glass**, **minimalismo**, y **rojo de marca `#e0241b` MUY puntual** (no gradientes ni glows fuertes).
- Fondo: grafito con gradiente sutil `radial-gradient(... #26282e → #16171b → #0d0e11)`.
- Paneles/cards: glass = `rgba(255,255,255,0.03)` + `1px solid rgba(255,255,255,0.08)` + `backdrop-filter: blur(12px)` + radius.
- CTAs primarios = **botón blanco** (fondo `#fff`, texto `#111114`), no rojo.
- Rojo solo como acento ocasional: badge de no-leídos, indicador REC de grabación, alguna barra de ranking. Verde solo funcional (status conectado, toggle on).
- Tipografía Inter. Sin subrayado en `<a>` que son botones.

## Landing (`src/app/page.tsx` + `landing.css`)
ULTRA-minimal: **"Fangio Bot"** gigante (gradiente blanco) + tagline "El Agente de IA para tu concesionaria." + CTA blanco "Probar el agente" + `© 2026 fangiocrm` al pie. Nav arriba a la derecha: **Registrarse** (glass) + **Iniciar sesión** (ghost). Sin secciones, sin footer separado. (Hubo una versión multi-sección que se descartó.)

## Demo del agente en vivo (`src/components/DemoAgent.tsx` + `/api/demo/chat` + `/api/demo/transcribe`)
El CTA "Probar el agente" abre un overlay: wizard compacto ("¿Cómo se llama tu concesionaria?") → chat que **abre el usuario**. Autocontenido (OpenAI `gpt-4.1-mini` streaming, NO usa el bot Python del VPS), reusa `OPENAI_API_KEY` ya en Vercel. Audio: mic → `/api/demo/transcribe` (Whisper `whisper-1`) → mensaje. Botón "Registrarse" blanco (solo en el chat; se oculta cuando aparece la tarjeta de cierre). IG/FB no aplica acá.

**Prompt del agente (porta la voz del bot real `bot-service/configs/prompts/trebol.txt`, NO la maquinaria de tools/stock real):**
- Se llama **Fangio**, se presenta "¡Hola! Hablás con Fangio de {concesionaria}", tono directo rioplatense, voseo. **AFIRMA stock con specs concretas inventadas** (es demo).
- Financiación **máx 12 cuotas** (nunca más). Siempre **"agendar una visita"**, PROHIBIDO "test drive"/"prueba de manejo".
- Toma de usados **impersonal** ("tomamos usados en parte de pago", NUNCA "te tomamos TU/EL usado").
- **Si ya nombró el modelo: PROHIBIDO preguntas de uso** ("para qué", "ciudad o ruta", etc.) → confirmar + avanzar a financiación/visita.
- **Permuta**: si ofrece un usado, pedir datos faltantes (modelo/año/km/estado) SOLO los no-dados; cuenta como "avanzar el cierre".
- **Multi-mensaje**: respuestas largas (>3-4 renglones) se parten con `[SPLIT]` → burbujas separadas (cliente usa `splitMessages`).
- **Cierre**: al aceptar la visita propone fecha/hora concreta; cuando queda pactada termina con `[FIN]` (oculto) → muestra tarjeta "Crear mi agente gratis".
- **Buffer estilo WhatsApp**: se mandan varios mensajes; el bot espera **4s** (`DELAY_MS`) desde el último. El "escribiendo…" solo aparece tras la espera.
- Guardas de costo: `max_tokens` 220 + cap 8 turnos. **Limitación**: endpoint público sin rate-limit por IP (si hay abuso → Upstash/Redis).

## Auth (`src/app/register/` + `src/app/login/`, comparten `register.css`)
Rediseñadas a grafito/glass split-screen (panel de valor a la izq + form a la der). Form con placeholders (sin labels verbosos), botón blanco. Copy: "Respuestas instantáneas para todos tus clientes." + "7 días de prueba gratis" + "En 3 pasos, sin programadores.". Login = mismo estilo, form email+contraseña. El `auth.css` viejo (rojo) quedó sin uso.

## Dashboard (`src/app/dashboard/page.tsx` + componentes de vista)
Todo a grafito/glass/minimal con rojo restringido:
- **Shell**: fondo grafito-gradiente, sidebar glass, scrollbars finas, banners/botones rojos planos (sin gradiente/glow), settings/subtabs activos en blanco.
- **Inicio** (`InicioView.tsx`): contenido reestructurado a pedido → cards **Leads (última semana) · Stock activo · Conversaciones en curso**, sección **Autos más buscados** (ranking, barras rojas sutiles, sale de `estado.vehiculoInteres`) y **Conversaciones en curso** abajo (con **foto de perfil** `profilePicUrl` + badge de **no-leídos** `unreadCount`). Borrada "Actividad reciente". Sin subtítulo bajo el saludo.
- **Chat** (`Chat/*`): tabs **IG y FB deshabilitadas** (solo WhatsApp). Burbujas glass (bot/outgoing más oscuro `0.05`, usuario/incoming más claro `0.11`). Panel derecho (`CustomerPanel`) full-height con **foto de perfil real** y sección **"Archivos"** abajo = grilla de imágenes que mandó el usuario (filtra `history` por `mediaType==="image"`). **Performance**: polling bajado de 3s (refetch completo) a **10s lista + 4s historial del chat abierto**.
- **Analíticas / WhatsApp / Configuración**: verdes/azules/indigo neutralizados a blanco/glass; botones (Conectar/Guardar) blancos; se mantienen status badges funcionales (conectado/pausado/desconectado).
- **API** `/api/dashboard/stats`: agrega `leadsLastWeek`, `topVehicles`, `activeConversations` (+ `profilePicUrl`, `unreadCount`) + `activeConversationsCount`.

## Fixes / gotchas importantes
- **InventoryGrid crasheaba toda la sección Inventario** ("This page couldn't load"). Causa: el `gridState` de la ingesta de stock (y versiones viejas) trae `columns`+`rows`+`data` pero **NO** `colWidths`/`rowHeights`; el render los indexaba → excepción. Fix: `LOAD_INITIAL_STATE` ahora **deriva siempre** `colWidths`/`rowHeights` de `columns`/`rows` con defaults (150/22). Commit `afcd392`. (Ver shape en [[reference_fangiocrm_gridstate_shape]].)
- **"This page couldn't load" al navegar**: casi siempre es **chunks viejos** por redeploy con la pestaña abierta (deployamos ~25 veces en la sesión). `Providers.tsx` ahora **auto-recarga una vez** ante `ChunkLoadError` (guarda anti-loop). Si persiste tras reload limpio sin deploy → bug real, pedir error de consola.

## Pendiente / backlog
- Rate-limit por IP en los endpoints públicos de la demo.
- Que el grid guarde `colWidths`/`rowHeights` al editar (hoy se generan por default al cargar stock ingestado).
- Pulir cierre `[FIN]` para que no deje preguntas abiertas.
