---
tags: [fangiocrm, fangiobot, ui, bot, sesion, rollback]
fecha: 2026-05-25
---

# Sesión 2026-05-25 — Dominio fangiobot, UI del chat, rollback del bot a WhatsApp

Sesión larga y multi-frente. Resumen del estado y el **backlog vivo** (seguir puliendo UI + bot).

## 1. Dominio — FangioBot (LIVE)
- **fangiobot.com** pasa a ser el dominio PRINCIPAL. DNS en Squarespace → Vercel (apex A `76.76.21.21`, `www` CNAME `cname.vercel-dns.com`). `NEXTAUTH_URL` + `APP_URL` = `https://www.fangiobot.com` en Vercel + redeploy. `APP_URL` parametrizado en `subscribe/route.ts` (commit FangioCRM `283ea88`).
- Pendiente: redirect `fangiocrm.com → fangiobot.com`; rebrand visual UI "FangioCRM"→"FangioBot". Ver memoria `project_fangiobot_domain_migration`.

## 2. Demo de la landing (/api/demo/chat) — LIVE en Vercel
- Persona "derivador de lujo" + ajustes (permuta, financiación afirmada, no muletillas, sentido común comprar-vs-entregar). Commits varios en `main` de FangioCRM (último ~`365c674`).

## 3. ⚠️ Bot de WhatsApp = ROLLBACK TEMPORAL (sin commitear)
**Decisión del usuario**: volver al bot LangGraph single-tenant de ~5 días atrás (`f1504a8`) porque el multi-tenant/derivador no estaba listo. **El working tree de `bot-service/` está en `f1504a8` + tweaks, SIN commitear** (reversible con `git checkout 289be0c -- bot-service`).
- Sirve el WhatsApp del **tenant gerstner** vía Evolution. Puente: `gerstner.yaml` nuevo (copia trebol) + `EVOLUTION_INSTANCE_NAME=gerstner` (override solo en el service del bot en `docker-compose.yml`) + el tenant manda `client_id=gerstner`.
- Recibe: WhatsApp → Evolution(gerstner) → `fangiobot.com/api/evolution/webhook` → bot `/webhook/fangiocrm`. Envía texto e **imágenes** por Evolution.
- Identidad: "Santi de **gerstner**" (nombre de agencia parametrizado vía `{NOMBRE_AGENCIA}` en prompts.py + greeting fix en graph.py:562).
- Mejoras aplicadas al bot viejo (todas sin commitear, baked en la imagen test — requiere rebuild, ver `reference_bot_rebuild_required`):
  - Vehículos en **formato hablado/natural** (no fichas con emojis).
  - **No buscar en saludo** ("hola" pelado ya no dispara búsqueda fantasma).
  - **Recomendar por TIPO + GAMA, no por marca**: si no está el modelo, el tool (`tools.py`) marca los same-brand como "NO sirven" y fuerza inferir tipo+gama y re-buscar. Camaro/Mustang sin equivalente → honesto "no tenemos autos de esa gama". Fiat 600 → recomienda clásicos. **Nunca** un 208/Ecosport de $12-15k para un deportivo de $50k.
  - **Fotos automáticas**: NUEVO `send_image`/`send_images` en `evolution_client.py` + wired en `fangiocrm.py` (Evolution `/message/sendMedia`, cap 4). El bot puebla `fotos_mensajeN` al recomendar. Verificado status 201. ⚠️ Solo **7/54** autos de gerstner tienen fotos cargadas (dato del stock, no bug).
  - **Búsqueda insensible a acentos** ("citroen" ↔ "Citroën") — `_ai_regex` en tools.py.
  - **Velocidad**: dólar blue cacheado 1h (no fetch por turno), debounce 3→1.5s, `max_tokens=600`. Latencia en caliente ~3.7s (era ~13s).

## 4. UI del chat del dashboard (FangioCRM, LIVE) — rediseño WhatsApp-Web
Componentes: `ChatLayout`, `MessageWindow`, `ConversationList`, `CustomerPanel`. Commits en `main` (último `e78ea62`/`d4f3767`).
- Burbuja única (sin doble borde), **hora gris dentro a la derecha**, texto off-white.
- Conversación ocupa **todo el ancho** entre columnas (override del cap `85%` de chatscope en `.cs-message-list__scroll-wrapper > .cs-message`). Outgoing pega a la derecha, incoming a la izquierda.
- Panel derecho de detalles SIEMPRE visible (con bot toggle); el ⓘ del header lo colapsa opcionalmente. **NO eliminarlo.**
- Sidebar con más aire, jerarquía, divisores inset, badge no-leído verde.

## 5. Backlog — SEGUIR PULIENDO (pedido del usuario 2026-05-25)
- **UI de FangioBot en general**: seguir mejorando (más allá del chat — login, dashboard, inventario, settings, landing). Mantener look premium SaaS / minimal.
- **Bot**: seguir puliendo respuestas (tono, cierres, manejo de objeciones, edge cases).
- **Stock sin fotos**: 47/54 autos de gerstner sin fotos → la recomendación visual cojea. Ver ingesta de fotos (URLs ML → re-host R2), spec en memoria `project_fangiobot_domain_migration` / idea de "ingesta de fotos" charlada.
- **Decisión pendiente del rollback**: ¿hacer permanente el bot single-tenant (commitear) o volver a multi-tenant/derivador y portar estas mejoras? Hoy está en working tree sin commitear.
- **Fine-tune del derivador**: dataset semilla (11 arquetipos) en `specs/2026-05-25-finetune-plan-derivador.md` + `bot-service/finetune/`. Pausado.
- **Rebrand UI** FangioCRM→FangioBot + redirect fangiocrm.com.

Memorias relacionadas: [[project_fangiobot_domain_migration]] · [[feedback_derivador_conversation_rules]] · [[reference_bot_rebuild_required]] · [[reference_bot_multitenant]].
