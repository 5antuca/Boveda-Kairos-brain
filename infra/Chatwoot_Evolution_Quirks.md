---
tags: [memoria, volcado, chatwoot, evolution, api, quirks]
fecha_volcado: 2026-04-13
---

# Chatwoot + Evolution API — Quirks operativos

Comportamientos no documentados que aprendí operando estos dos servicios en el VPS Kairos.

## Chatwoot

### `custom_attributes` actualizado por dblink NO se refleja en webhooks

El caso canónico del [[2026-04-12 Handoff Blando Jeep Compass|bug Jeep Compass]]. Chatwoot serializa `Conversation` desde Rails al disparar un webhook. Si modificás `custom_attributes` con un UPDATE SQL directo (via dblink_exec desde Postgres, por ejemplo), **Rails no se entera** y los siguientes webhook payloads traen el estado viejo.

**Regla**: si vas a leer un campo en el webhook, modificalo por la API HTTP (Rails), no por SQL directo.

### Endpoint correcto para setear `custom_attributes.bot`

```
PATCH /api/v1/accounts/{account_id}/conversations/{conversation_id}/custom_attributes
Headers: api_access_token: {CHATWOOT_TOKEN}, Content-Type: application/json
Body: { "custom_attributes": { "bot": "off" } }
```

Este PATCH es un **merge**, no un replace — preserva otros campos del custom_attributes.

### Endpoint alternativo: `toggle_status`

```
POST /api/v1/accounts/{acc}/contacts/{contact_id}/contactable_inboxes/{inbox_id}/toggle_status
```

Más agresivo: deshabilita el contact en un inbox específico. No lo usamos porque es más invasivo que necesario — `custom_attributes.bot=off` ya le dice al workflow que se cortocircuite.

### Login 500 bug — `account_users` frágil

**Síntoma**: usuario intenta login en Chatwoot prod → `AxiosError: Request failed with status code 500`. En logs de Chatwoot:
```
ActionView::Template::Error (undefined method `name' for nil)
  app/views/api/v1/models/_user.json.jbuilder:23:in
  account_user.account.name
```

**Causa**: el user tenía una row en `account_users` que apuntaba a un `account_id` borrado (típicamente id=2, la account default del install inicial que alguien eliminó).

**Fix** (aplicado a santiago user_id=2 en prod el 2026-04-13):
```sql
-- Backup primero
\copy (SELECT * FROM account_users WHERE user_id = 2) TO '/tmp/account_users_backup.sql';

-- Limpiar rows huérfanos
DELETE FROM account_users WHERE id IN (1, 2);

-- Agregar a la account correcta (El Trebol = id 4 en prod)
INSERT INTO account_users (user_id, account_id, role, created_at, updated_at, active_at, availability)
VALUES (2, 4, 1, NOW(), NOW(), NOW(), 0);
-- role 1 = administrator
```

**Regla**: siempre backup antes de tocar `account_users`. Tabla frágil, errores silenciosos hasta que alguien intenta login.

### Account IDs (prod)

- Account id 4 = El Trébol Automotores
- Account id 1, 2 = install defaults, ya eliminadas (no usar)

### DB credentials

- DB `chatwoot` (prod) → user y password en `.env` del stack `trebol-prod-chatwoot`
- DB `chatwoot` (test) → `.env` del stack `trebol-test-chatwoot`

## Evolution API

### ❌ NUNCA `DELETE /instance/logout` en prod

Rompe la sesión de WhatsApp del cliente. Hay que re-escanear QR y perdés historial de sessions. Es la operación más destructiva del stack. **Prohibida sin pedido explícito del usuario.**

Ver [[feedback_evo_logout_prohibited]] en memory store.

### Endpoint para enviar mensajes

```
POST /message/sendText/{instance_name}
Headers: apikey: {EVOLUTION_API_KEY}
Body: { "number": "5491150635028", "text": "..." }
```

Instance names observadas:
- Prod: value de `$env.EVOLUTION_INSTANCE_NAME` en stack prod
- Test: idem en stack test

### Envío a grupo WhatsApp

```
POST /message/sendText/{instance}
Body: { "number": "{group_id}@g.us", "text": "..." }
```

El `group_id` del grupo de vendedores vive en `$env.WHATSAPP_ALERTS_GROUP_ID`.

### Evolution API + Chatwoot bridge

Evolution API es el puente WhatsApp ↔ Chatwoot. Arquitectura:
```
WhatsApp → Evolution API (Baileys) → Chatwoot webhook → n8n (Trebol v4)
                                  ← Chatwoot outbound ← Evolution API ← n8n response
```

Si Evolution cae, Chatwoot no recibe mensajes nuevos pero la UI sigue funcionando para contestar manualmente (por Chatwoot directo, no por WhatsApp).

### Health check

```bash
docker ps --filter "name=evolution"
# Estado esperado: Up X weeks (healthy)
```

Si pasa a `unhealthy`, chequear conexión con Chatwoot y reiniciar **solo Evolution**, no tocar Chatwoot.

### Sesion fantasma - 3 modos de falla

`docker healthy` + `connectionState=open` **no alcanza** para saber si Evolution está realmente vivo. Baileys tiene 3 modos de degradación silenciosa donde la API reporta todo OK pero los mensajes 1:1 de clientes no bajan. `scripts/health-check-advanced.sh` detecta los tres cada 5min.

**Mode A — Full zombie**
- Síntoma: 0 `messages.upsert` de cualquier tipo en 30min (ni broadcasts ni grupos ni 1:1).
- Causa: socket Baileys colgado, WhatsApp dropeó la sesión del lado server.
- Fix automático: `docker restart trebol-prod-evolution-api` (1 vez por hora max).

**Mode B — Degraded (ghost 1:1)**
- Síntoma: `state=open`, llegan `status@broadcast` y/o mensajes de grupo (`@g.us`), pero 0 mensajes 1:1 (`@s.whatsapp.net`) en 30min.
- Causa: WhatsApp entrega eventos broadcast/grupo pero no routea 1:1 a esta sesión. Clásico "ghost session" — el dispositivo sigue registrado pero el routing 1:1 está roto.
- Fix automático: `POST /instance/restart/{instance}` (API endpoint, más liviano que restart del container). **NO usar docker restart para Mode B** — queda degradado (aprendido 2026-04-01).
- **Bug histórico (fixed 2026-04-14)**: el script contaba grupos como "1:1 sano" y no detectaba este modo cuando el grupo interno seguía flujo. Ahora filtra `@g.us` explícitamente.

**Mode C — Baileys init queries fail** *(descubierto 2026-04-14, procedimiento completo 2026-04-16)*
- Síntoma: post-restart/reconexión, el log tira `unexpected error in 'init queries'` con `bad-request` en `executeInitQueries` (fetchProps). El socket llega a `state=open` y arranca `CONNECTED TO WHATSAPP`, pero nunca recibe `messages.upsert` reales.
- Causa: WhatsApp server rechaza las queries iniciales del socket. Auth state parcialmente corrupto o device kickeado del lado server.
- Fix automático: **NINGUNO**. Restartear no arregla nada — el socket vuelve a fallar en las mismas queries.
- **Procedimiento manual completo** (aprendido 2026-04-16):
  1. **Identificar la instance UUID**: `curl .../instance/connectionState/trebolfinal` → inspeccionar logs para el UUID de la instancia (ej. `f34f4be7-6775-4e04-9ce5-eb1334e87d25`)
  2. **Borrar sesión de Redis DB 1** — donde `CACHE_REDIS_SAVE_INSTANCES=true` persiste el auth state:
     ```bash
     REDIS_PASS=$(docker exec trebol-prod-evolution-api printenv REDIS_PASSWORD)
     # Borrar session de la instancia
     docker exec trebol-prod-redis redis-cli -a "$REDIS_PASS" -n 1 DEL "evolution:instance:{UUID}"
     # Borrar todas las keys de Baileys (sender-keys, sessions, etc.)
     docker exec trebol-prod-redis redis-cli -a "$REDIS_PASS" -n 1 KEYS "evolution:baileys:*" | \
       xargs docker exec -i trebol-prod-redis redis-cli -a "$REDIS_PASS" -n 1 DEL
     ```
  3. **Actualizar estado en Postgres** (Evolution API DB):
     ```sql
     UPDATE "Instance" SET "connectionStatus"='close', "ownerJid"=NULL WHERE "name"='trebolfinal';
     ```
  4. **Reiniciar container**: `docker restart trebol-prod-evolution-api`
  5. **Generar nuevo QR**: `POST /instance/connect/trebolfinal`
  6. **Escanear QR** desde `https://trebol.evo.kairosaisolutions.com/manager` → instancia `trebolfinal` → Conectar
- **Por qué el simple restart no alcanza**: con `CACHE_REDIS_SAVE_INSTANCES=true`, el auth state vive en Redis DB 1. Al reiniciar, Evolution carga los mismos credentials corruptos y reproduce el mismo Mode C. Hay que limpiar Redis primero.
- Guard: si el health check detecta zombie (Mode A/B) **y** init queries fallando en la misma ventana, **salta el auto-restart** y alerta `zombie_needs_qr` pidiendo intervención humana. Evita restart loops.

**Secondary signal**: además de contar mensajes, el script chequea ejecuciones del workflow prod (`wf4ts1WKcpOaE90A__FkD`) en `execution_entity` de Postgres. Si hay ejecuciones, el webhook está vivo y el silencio de mensajes puede ser real (horas muertas, domingos). Solo dispara auto-restart si `DIRECT_MSG_COUNT=0` **y** `EXEC_COUNT=0`.

**Ventana operativa del auto-restart**: Lun-Sab 9:00-20:00 local. Fuera de ese horario solo alerta, no restartea (evita falsos positivos por horario muerto).

## Integración n8n con Chatwoot

### Webhook que dispara el bot

Chatwoot envía un POST a `/webhook/{uuid}` del n8n cada vez que:
- Llega un mensaje nuevo (`message_created`)
- Cambia status del conversation (`conversation_status_changed`)
- Se crea conversation nueva (`conversation_created`)

El workflow solo procesa `message_created` con `message_type: incoming`.

### UUIDs de webhooks observados

- Trebol v4 test: `/webhook/{uuid}` — buscar en el primer nodo del workflow
- MV Autos test: `/webhook/fd88e196-87b4-4851-9f9f-09a8a7a22d22`

## Links

- [[Pipeline_v4]]
- [[2026-04-12 Handoff Blando Jeep Compass]]
- [[VPS_Stack]]
- [[Preferencias_Arquitectura]]
