---
tags: [fangiocrm, fangiobot, ui, chat, dashboard]
fecha: 2026-05-26
relacionado: [[FangioBot]], [[Sesion_2026-05-25_UI_y_Bot]], [[UI_y_Demo_2026-05]]
---

# Sesión 2026-05-26 — Rework del chat del dashboard (FangioBot)

Sesión larga e iterativa puliendo el chat del dashboard de FangioBot (`/root/apps/FangioCRM`, Next 16 / React 19, deploy Vercel a fangiobot.com). Terminó con el chat **100% nativo, sin librería**.

## Estado final
El chat (`src/components/Chat/MessageWindow.tsx` + `ChatLayout.tsx`) es **custom/nativo**:
- Lista propia `<div.mw-list>` scrolleable + **autoscroll por ref** (sin el `MessageList` de chatscope).
- **Burbujas estilo WhatsApp**: agrupadas por remitente (mismo remitente pegaditos, cambio de remitente con respiro), **colita** solo en el último del grupo, ancho parejo cliente↔IA.
- **Hora estilo WhatsApp** ("truco" que funciona): burbuja `display:flow-root; position:relative`, cuerpo `display:inline`, hora `float:right` anidada → corto en la misma línea, largo abajo-derecha del último renglón. Tamaño 10px.
- **Álbum de imágenes**: 4+ imágenes consecutivas del mismo remitente → grilla 2×2; la 4ª celda muestra `+N` (N = total−4) si hay más. 1-3 → individuales. Lógica en `buildItems()`.
- **Input nativo** `<textarea>` (Enter envía / Shift+Enter newline). Reemplazó al `MessageInput` de chatscope (daba problemas de foco/click y fondo claro).
- **Envío optimista sin parpadeo**: el merge del polling MANTIENE el mensaje optimista (id `temp-`) con su key estable y descarta el duplicado del server. Antes se reemplazaba el temp por el del server → cambiaba el key de React → la burbuja se desmontaba/remontaba ("se envía, desaparece, reaparece").
- **Spinner de carga** al abrir un chat (mientras vuelve el fetch de `/api/leads/{id}/messages`). Re-abrir un chat ya cargado es instantáneo (history cacheada en `chats`).
- Media (imagen suelta/audio/video/doc), caption, lightbox — todo intacto.

## Librerías DESCARTADAS (no reintentar sin razón nueva)
- **chatscope** (`@chatscope/chat-ui-kit-react`): sacado por completo. (1) su `MessageList` re-renderiza y hace parpadear/desaparecer mensajes al enviar; (2) `.cs-message__content` es flex item → con `flex-shrink:1` (default) **exprime la burbuja `width:fit-content` a min-content (1 letra)** y rompía el texto letra-por-letra. El override `flex-shrink:0` mitigaba pero el parpadeo seguía → se eliminó. **Deps `@chatscope/*` quedaron en `package.json` sin uso → limpiar.**
- **chatcn** (`leonickson1/chatcn`, shadcn + Tailwind v4): probado en rama `feat/chat-chatcn` y **revertido**. Se veía mal: barra de hover (reacciones/responder/borrar) no deseada + densidad propia. Tailwind v4 se metió (sin preflight) y se sacó en el revert. La rama queda pusheada por si algún día.

## ⚠️ Gotcha de deploy/verify (importante)
Los **previews de rama de Vercel NO sirven** para que el usuario valide UI:
- `ssoProtection: all_except_custom_domains` → el preview pide login de **Vercel** (no de la app).
- `NEXTAUTH_URL` apunta a prod → el login de la app **falla** en el host del preview.
- El preview comparte la **misma Mongo que prod** → NO borrar tenants ahí.

→ Se valida mergeando a `main` (deploya a fangiobot.com, login OK) y se revierte con `git revert` si está mal. Bajo riesgo (build verde; Tailwind/preflight no aplica en main). Para chequear deploys vía API: proyecto `fango-crm` (`prj_hPmY5ZHrknXxaKVCHziqMXNP0qn3`), team `team_Tnq9SkTdhvskRFGIWvnoDC8J`, token Vercel en [[Keys]].

## Pendiente
- Limpiar deps sin uso de `package.json`: `@chatscope/chat-ui-kit-react`, `@chatscope/chat-ui-kit-styles`.
- Decidir qué hacer con la rama `feat/chat-chatcn` (migración chatcn descartada).
- Opcional: optimizar el endpoint `/api/leads/{id}/messages` si el primer-abrir sigue lento (hoy cubierto con spinner).
