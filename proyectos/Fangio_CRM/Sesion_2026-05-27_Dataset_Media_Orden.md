---
tags: [fangiocrm, fangiobot, dataset, finetune, chat, bot, orden, media]
fecha: 2026-05-27
relacionado: [[FangioBot]], [[Sesion_2026-05-26_Chat_UI]], [[Roadmap_SaaS_MVP]], [[FangioBot_Estrategia_Marca]]
---

# Sesión 2026-05-27 — Armado de dataset, media en el chat, switch irrompible y orden de mensajes

Sesión larga en FangioCRM (`/root/apps/FangioCRM`, Next 16, deploy Vercel → fangiobot.com). **Workflow del repo: se commitea directo a `main` → auto-deploy a prod; el último deploy queda como Current.** (ver memoria `feedback_fangiocrm_deploy_main_prod`).

## 1. Infra para armar el dataset del fine-tune (lo más importante)

Objetivo: juntar conversaciones reales + correcciones para fine-tunear el bot derivador (que OBEDEZCA las reglas; el prompt-only no alcanza). Todo LIVE:

- **Botones por chat**: **Archivar** (guarda ejemplo + clasifica + resetea) y **Resetear** (limpia conversación + memoria, sin guardar).
- **Comandos desde WhatsApp** (jugando de cliente): `(archivar)` / `(resetear)` → ejecutan la acción y responden "✅ Archivado/Reseteado". NO van al bot.
- **Notas entre paréntesis**: texto `( ... )` en cualquier parte = anotación del admin (rol `nota`). **El bot SOLO ve lo de afuera** del paréntesis. Es la corrección que alimenta el fine-tune.
- **Colección `bot_examples`** (Mongo `fangio_crm`): guarda la conversación (turnos + notas) y se **auto-clasifica** con gpt-4.1-mini → `labels {calidad: buena|mala|mixta, tipos[], combinado, motivo}`. La nota del admin es la señal principal de `calidad`.
- Código: `src/lib/conversationActions.ts` (archive/reset compartido), `src/lib/classifyConversation.ts`, rutas `/api/leads/[id]/archive` y `/reset`, modelo `src/models/BotExample.ts`.

**Feedback recurrente detectado** (el bot ignora reglas que YA están en el prompt → material del fine-tune): recomendar por TIPO no por marca · no volcar listas / prohibido "¿cuál te interesa?" · derivación con frase canónica · fotos 1-por-auto con caption · no cortar en seco ante sin-stock · no ofrecer handoff por fotos sin pedirlas · saludar en primer turno.

→ **Roadmap detallado del fine-tune** en memoria `project_fangiobot_finetune_dataset` + spec `specs/2026-05-25-finetune-plan-derivador.md`. Próximo: re-hacer ejemplos contaminados, llegar a ~30-50, script export a JSONL, entrenar.

## 2. Media saliente en el chat (imágenes y videos)

- El chat ahora **adjunta y envía imágenes/videos**: botón 📎 + drag&drop, **múltiples a la vez**, tray de preview.
- **Subida directa navegador→Vercel Blob** (client upload, `@vercel/blob/client`, `/api/media/upload`) → **sin el límite de 4.5MB** de las funciones serverless (soporta videos grandes). Después se manda la URL pública a Evolution `sendMedia`.
- Las URLs de Blob se renderizan directo (el `/api/media/proxy` es solo para media de Evolution con apikey).
- ⚠️ Requiere **`BLOB_READ_WRITE_TOKEN`** en Vercel (Production) — el mismo del store `fangioFotos`.

## 3. Switch ON/OFF del bot — ahora IRROMPIBLE

Bug reportado: con el switch en OFF, tras un **reset** el bot volvía a responder.
- **Causa raíz (patrón repetido): el `client_id`.** Las llamadas de control al bot (toggle, vendor-lock, reset) iban **sin `client_id`** → el bot seteaba/limpiaba `bot_off` en `bot:{default}:{phone}` en vez de `bot:{tenant}:{phone}` → su gate nunca veía la pausa. Fix: pasar `client_id = lead.botClientId || lead.tenantId` en TODAS las llamadas a `/webhook/fangiocrm/control`.
- **Reset/archivar ya NO tocan el on/off**: `conversationActions` no setea `botActivo=true` y el `action:"reset"` del bot no limpia `bot_off`. El switch es la **única verdad** y sobrevive a reset/archivar.
- **Doble gate**: webhook frena por `lead.botActivo` (Mongo) + bot frena por `bot_off` (Redis, namespace correcto).

## 4. Orden de mensajes — la saga y la decisión final

Síntoma: los mensajes "saltaban" / aparecían desordenados, sobre todo **al cambiar de tab**.
Tres causas, en capas:
1. **Sort inestable** ante timestamps iguales → desempate por `_id` (monotónico por inserción). `sort({timestamp:1, _id:1})`.
2. **Temps optimistas** (mensajes del dashboard, id `temp-`) se agregaban al final y **nunca se reconciliaban** → quedaban mal ubicados y persistían al cambiar de tab. Fix: orden del server autoritativo; solo se agregan los temps **no confirmados**, y se descartan apenas el server los tiene.
3. **⭐ CAUSA DE FONDO — dos relojes.** Entrantes usaban el timestamp de **WhatsApp (reloj del teléfono)**; bot/vendedor el del **server**. Con el server adelantado, un mensaje nuevo del cliente caía ANTES del bloque del bot. **Decisión: UN SOLO RELOJ (el del server).** Los entrantes usan la **hora de recepción del server**, capturada al *entrar* el webhook (antes de bajar media, para no atrasar fotos). + anclaje de bot/vendedor (`timestamp = max(now, últimoTs+1)`).

⚠️ **Regla para el futuro: NO ordenar mensajes mezclando reloj del teléfono y del server.** Un solo reloj.

## 5. Velocidad del bot + saludo (repo kairos, bot Python)

- **Fast-path de saludo pelado**: "hola/holaaa/buenas" sin info → responde al instante "¡Hola! Hablás con {nombre} de {agencia}, ¿en qué te puedo ayudar?" **sin LLM ni búsqueda** (`graph.py:_is_bare_greeting`). Arregla el "holaaa → recomendó autos".
- **Debounce 3s → 1.5s** (`client_config.py`).
- Prompt: saludo abierto + pedir nombre = solo "¿Cómo te llamás?" (sin "así te paso opciones a tu medida").
- ⚠️ Estos cambios del bot quedaron **rebuildeados pero SIN commitear** en el repo kairos (branch `bot-rollback-2026-04-18`).

## 6. Otros fixes del chat
- La **descripción IA de una foto** ya NO pisa el caption del cliente (era interna, para el marker del bot). La UI muestra el caption real del cliente.
- Textarea del chat **auto-expandible hasta ~5 renglones** y después scroll vertical.
- Toda la UI de **rojo → verde** (marca emerald `#10b981`; base gris/glass intacta).

## 7. Decisión de método de fine-tune (2026-05-27, tarde)

Al revisar los **10 ejemplos ya archivados** (Claude los inspeccionó en Mongo) salió una distinción clave: hay **dos voces** en `bot_examples`:
- `rol: bot` (#1–#4) = **trazas reales del bot** con `nota` de qué hizo mal.
- `rol: vendedor` (#5–#10) = **el usuario escribiendo a mano la respuesta ideal** (jugando de vendedor desde Fangio mientras se hace pasar por cliente por WhatsApp).

El usuario quería usar las trazas malas como **negativos** ("cómo NO tiene que funcionar") y su texto a mano como **positivos**. Análisis y **decisión final**:

- **Método = SFT (fine-tune supervisado) sobre el gold escrito a mano. NO DPO.** Es el método que mejor instala el comportamiento ("dejar el bot funcionando exactamente como quiero") Y el que mejor calza con el workflow cómodo del usuario (escribir conversaciones ideales enteras durante el día). SFT = clonado de comportamiento: le mostrás N conversaciones perfectas y aprende a producirlas.
- **Por qué NO DPO** (aunque era la idea inicial de "negativos"): el SFT normal **no puede aprender de negativos** — solo imita los `assistant` que le das; meter una respuesta mala enseña a repetirla. El método que sí usa pos/neg es **DPO (preference)**, pero necesita el bueno **y** el malo *en el mismo punto exacto* de la charla. El workflow del usuario produce **conversaciones buenas completas**, no pares alineados turno-a-turno (una corrida mala y una buena del mismo caso *se desvían* tras el primer turno → no se parean mecánicamente). Por eso DPO no encaja sin cambiar a un flujo incómodo (dejar que el bot conteste mal y corregir ese turno puntual).
- **Los negativos NO se tiran**: cambian de rol → **set de evaluación** (tras entrenar, reproducir esos escenarios y verificar que el modelo nuevo los resuelve) + **checklist** de qué casos cubrir con gold.

**Workflow diario validado** (seguir así): cliente por WhatsApp + vendedor a mano desde Fangio. Tres recordatorios para que cada charla sume:
1. Cubrir la **matriz**, sin repetir caso: compra · permuta · financiación · objeción precio · "lo pienso" · no-sabe · sin-stock · multi-vehículo · fuera de horario · insistente · **spam** (ahora que está el anti-spam guard, una charla que termina sin respuesta es ejemplo válido).
2. **Variar nombres** (Santi/Gerstner, otra agencia/vendedor) → que el modelo lea el nombre del prompt, no hardcodee "Santi" (multi-tenant safe).
3. Cada respuesta `vendedor` **es la verdad que el modelo copia** → escribirla ya canónica (frase de derivación exacta, sin "Perfecto/Te entiendo").

**Detalle de formato (lo maneja el export):** el bot real responde en **JSON multi-burbuja** (`{"mensaje1","mensaje2",...}`) y decide tools; el gold a mano es texto plano. El script de export envuelve el gold en el contrato del bot (drop-in, sin tocar el parser). Para casos con stock, ver cómo reconstruir el resultado de la tool en el contexto (alcance "estilo"/opción A de la spec, no tool-calling).

**Próximo paso concreto:** Claude arma el script `bot_examples → JSONL OpenAI` en el repo kairos (no toca prod): toma solo los `vendedor` (positivos) como targets, los mapea al formato del bot, manda los `bot`-traces a un archivo de eval aparte, y valida el JSONL. El usuario sigue archivando gold hasta ~30-50 cubriendo la matriz. Ver memoria `project_fangiobot_finetune_dataset` (actualizada) y `specs/2026-05-25-finetune-plan-derivador.md` §6 (decisiones, ahora resueltas).

## Pendientes
- Commitear los cambios del bot (fast-path/debounce/prompt) en el repo kairos.
- Fine-tune: **(decidido: SFT sobre gold)** re-hacer ejemplos contaminados, llegar a ~30-50 cubriendo la matriz, armar el script de export a JSONL.
- Dedup del eco fromMe de Evolution (mensaje saliente aparece 2x: vendedor + bot).
- Que `(archivar` sin paréntesis de cierre también dispare.
- Soporte de **reproducir audios**: el player `<audio>` ya está; faltó un audio de prueba para diagnosticar (0 en la base). Definir si además se pueden **mandar** audios desde la UI.
