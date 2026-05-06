---
tags: [langgraph, bot, operar, runbook, bot-off, alertas]
fecha: 2026-04-18
estado: vigente
---

# Operar el bot Python — runbook

Cómo apagar, prender, silenciar y reactivar el bot Python (trebol-test-bot / trebol-prod-bot), y cómo manejar las alertas y su anti-duplicación.

> Detalles exclusivos de prod (IDs Chatwoot, WhatsApp group, extra_hosts, rollback): ver [[Prod_Deploy]].

## Arquitectura del handoff (quién decide que el bot se apague)

Hay **4 niveles** para controlar el bot:

1. **Global** (container): `docker stop trebol-test-bot` — apaga todo, deja al servicio muerto. Solo para mantenimiento / emergencia.
2. **Por conversación** (Chatwoot): toggle `bot: off` en `custom_attributes` de la conversación desde la UI de Chatwoot.
3. **Por teléfono** (Redis flag): `bot:{client_id}:{phone}:bot_off` con TTL. Es el método manual recomendado.
4. **Auto-ignore conversaciones pre-existentes**: si el bot nunca respondió a un teléfono (sin history en Redis) Y la conversación Chatwoot ya tiene mensajes previos al actual (ej: un humano la estaba manejando), el bot ignora el mensaje.

El webhook handler chequea los 4 niveles antes de procesar. Si cualquiera dispara → ignora el mensaje.

### Sobre el nivel 4 (conversaciones pre-existentes)

Caso de uso: apagaste el bot (docker stop o bot-off global), el vendedor estuvo hablando con un cliente manualmente. Luego reactivás el bot. Sin este check, el bot respondería al próximo mensaje del cliente — interfiriendo con el vendedor.

Regla: `conversation.messages_count > 1` + no hay history del bot para ese teléfono → skip. Log: `conversation_preexistent_skipped`.

El bot sí responde cuando:
- Es el primer mensaje de una conversación nueva (count=1)
- El bot ya había respondido antes a ese teléfono (existe history en Redis)

Cómo forzar que el bot retome una conversación que ya ignoró:
```bash
# El bot detecta history para decidir responder. Si limpiaste memoria y ya
# le habías respondido antes, o querés que arranque en una conversación vieja,
# podés "sembrar" history fake (hack de emergencia — raro necesitarlo):
docker exec trebol-test-redis redis-cli -a "<pwd>" --no-auth-warning \
  RPUSH "bot:trebol:<phone>:history" '{"type":"ai","content":"seed"}'
```

## Apagar el bot para un cliente específico

```bash
# Default: test, TTL 72h
bash scripts/bot-off.sh 5491150635028

# Prod
bash scripts/bot-off.sh 5491150635028 prod

# TTL custom en segundos (ej: 24h)
bash scripts/bot-off.sh 5491150635028 test 86400
```

El script:
- Normaliza el teléfono a solo dígitos.
- Setea `bot:trebol:{phone}:bot_off` = `"manual"` con el TTL indicado.
- Setea la misma key también con sufijo `@s.whatsapp.net` por seguridad (el webhook normaliza pero esto cubre edge cases).
- El bot deja de responder mensajes de ese teléfono inmediatamente.
- Al expirar el TTL, el bot vuelve a responder solo (a menos que se renueve el flag).

## Prender el bot para un cliente

```bash
bash scripts/bot-on.sh 5491150635028           # test
bash scripts/bot-on.sh 5491150635028 prod      # prod
```

Borra el flag `bot_off` del teléfono. El bot responde en el próximo mensaje del cliente.

## Ver estado (está apagado o no)

```bash
docker exec trebol-test-redis redis-cli -a "<password>" --no-auth-warning \
  GET "bot:trebol:5491150635028:bot_off"
```

Si devuelve `"manual"` / `"handoff"` / `"pedido"` / etc. → apagado (con razón).
Si devuelve `(nil)` → prendido.

## Apagar el bot globalmente (mantenimiento)

```bash
# Detener (el bot no recibe webhooks de Chatwoot, queda colgado)
docker stop trebol-test-bot

# Reiniciar
docker start trebol-test-bot

# Ver logs en vivo
docker logs -f trebol-test-bot
```

Alternativa menos disruptiva: cambiar el webhook de Chatwoot ID 1 a otra URL (PATCH via API), lo que desvía los mensajes sin matar el container.

## Auto-handoff (cuándo el bot se apaga solo)

El bot **se apaga automáticamente** cuando el CRM extraction detecta:
- `estado = "pedido"` → cliente quiere anotarse para un auto sin stock. Handoff duro + alerta pedido.
- `estado = "compró"` → cliente cerró compra. Handoff duro + cierre.

En ambos casos se setea `bot:{client_id}:{phone}:bot_off` con TTL 72h, razón = el estado.

`estado = "caliente"` NO apaga el bot — dispara alerta al vendedor pero el bot sigue ayudando al cliente mientras el vendedor toma la conversación.

## Alertas al grupo de vendedores

Fuente única: webhook n8n `{N8N_INTERNAL_URL}/webhook/alertas-vendedores`, workflow `AlertasVendedores` (ID test: `GyW7SjZluIdZyAYt_9LIO`).

Tipos de alerta:
| Tipo | Disparado por | Payload mínimo | Dedup |
|---|---|---|---|
| `lead_caliente` | `estado=caliente` + `alerta_enviada=no` | tel, mensaje, url | Sheets `ALERTA_ENVIADA` |
| `pedido` | `estado=pedido` | nombre, vehiculo, presupuesto | Sheets `ALERTA_ENVIADA` |
| `papeles` | LLM marca `tipo_alerta=papeles` | tel, mensaje, url | Sheets `ALERTA_ENVIADA` |
| `foto` | Cliente envía foto (webhook detecta attachment file_type=image) | nombre, tel, url | Redis flag 30 min (`bot:{cid}:{phone}:alerta_foto`) |
| `bot_off` | CRM extraction → handoff | tel, motivo, url | — |
| `openai_quota` | `openai.RateLimitError` en el grafo | tel, motivo=code | Redis flag permanente (`bot:{cid}:openai_quota_alert_sent`) |
| `openai_quota_recovered` | Próximo turno OK después de un quota agotado | (sin payload) | Auto-borrado del flag quota |

Detalle operacional de `openai_quota` / `openai_quota_recovered` (cuándo y cómo llegan, cómo recargar, cómo resetear manualmente): [[OpenAI_Quota_Fallback]].

### Anti-duplicado: columna ALERTA_ENVIADA del CRM Sheets

Antes de disparar cualquier alerta (excepto foto, que se dispara desde el webhook sin chequear), el bot consulta la columna `ALERTA_ENVIADA` (columna M) del CRM Sheets de la fila del teléfono. Si el valor es `"sí" / "si" / "yes"` → NO dispara la alerta.

Esto cubre:
- **Auto**: la alerta previa seteó `ALERTA_ENVIADA = "sí"` → no re-dispara en turnos siguientes.
- **Manual**: el vendedor puede editar el Sheet y poner `"sí"` para silenciar alertas de un chat sin tocar código.

Para re-habilitar alertas: vaciar la celda ALERTA_ENVIADA o poner `"no"`.

### Grupo de WhatsApp — test vs prod

El workflow `AlertasVendedores` lee `WHATSAPP_ALERTS_GROUP_ID` del env de n8n. **El group_id es distinto en test y prod** — al promover cualquier cambio, verificar que `environments/prod/trebol/.env` tenga el ID del grupo de prod (no el de test).

## Limpiar memoria completa de un teléfono (test)

```bash
bash scripts/clear-chat-memory.sh 5491150635028
```

Limpia:
- Postgres `n8n_chat_histories` (histórico de n8n)
- Redis n8n (`{session_id}:*`)
- Redis bot Python (`bot:trebol:{phone}:*` — history, crm_state, bot_off, buffer, processing)
- Fila 4 de CRM Sheets si matchea el teléfono

**Post-limpieza: el bot se comporta como si fuera el primer mensaje.** Incluye borrar el bot_off si lo había.

## Tabla resumen de comandos

| Qué quiero | Comando |
|---|---|
| Apagar bot para un cliente | `bash scripts/bot-off.sh <phone>` |
| Prender bot para un cliente | `bash scripts/bot-on.sh <phone>` |
| Apagar bot globalmente | `docker stop trebol-test-bot` |
| Reiniciar bot globalmente | `docker start trebol-test-bot` / `docker restart trebol-test-bot` |
| Silenciar alertas de un chat | Editar CRM Sheets → ALERTA_ENVIADA = "sí" |
| Re-habilitar alertas | Vaciar ALERTA_ENVIADA |
| Ver logs bot | `docker logs -f trebol-test-bot` |
| Ver estado de un phone | `docker exec trebol-test-redis redis-cli -a ... GET "bot:trebol:<phone>:bot_off"` |
| Limpiar memoria total de un phone | `bash scripts/clear-chat-memory.sh <phone>` |
| Ver todas las keys de un phone | `docker exec trebol-test-redis redis-cli -a ... KEYS "bot:*<phone>*"` |

## Links

- [[LangGraph_Bot]] — overview del proyecto
- [[OpenAI_Quota_Fallback]] — qué hace el bot cuando OpenAI tira 429
- [[Observabilidad_Langfuse]] — debugging con traces
- [[Sesion_2026-04-17_Bugs_y_Observabilidad]] — postmortem bugs resueltos
