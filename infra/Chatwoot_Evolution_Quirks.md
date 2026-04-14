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
