---
tags: [langgraph, bot, alertas, openai, rate-limit, runbook]
fecha: 2026-04-19
estado: vigente
---

# Fallback de OpenAI quota / rate-limit

Cómo el bot reacciona cuando OpenAI devuelve `429 insufficient_quota` o `rate_limit_exceeded`, cómo se avisa al grupo de vendedores y cómo vuelve solo cuando se recarga crédito.

> **Deployado en TEST y PROD (2026-04-19)** — ver commit `40d94f3` en `kairos-infrastructure`.

## El problema que resuelve

Hasta el 2026-04-18 cuando OpenAI tiraba 429 en producción, el bot:
1. Recibía el webhook de Chatwoot OK.
2. Llamaba al grafo → `ChatOpenAI` tiraba `openai.RateLimitError`.
3. Loggeaba `graph_invoke_error` y no respondía nada.
4. Nadie se enteraba — ni el cliente, ni los vendedores, ni el admin.

Real en prod: 2h sin respuestas al cliente y cero alertas. Se descubrió por casualidad mirando Chatwoot.

## Qué hace ahora

Cuando el bot recibe `openai.RateLimitError`:

1. **Redis**: setea flag permanente `bot:{client_id}:openai_quota_alert_sent` (sin TTL). Es una "lock" global por cliente — mientras exista, cualquier nueva 429 se silencia en vez de flotar alertas duplicadas al grupo.
2. **Bot-off**: marca `bot_off` sobre la conversación afectada con TTL 6h, razón = `openai_quota:{code}`. Si el cliente vuelve a escribir durante la caída, el bot ni siquiera intenta responder.
3. **Alerta única al grupo** (solo primera vez): POST a `{N8N_INTERNAL_URL}/webhook/alertas-vendedores` con `tipo_alerta=openai_quota`. El workflow n8n `AlertasVendedores` manda un mensaje al grupo de WhatsApp de vendedores con el link de billing.
4. **Silencio al cliente**: retorna `([], [])` desde `handle_message()` — `chatwoot.py` lo interpreta como "silent turn" y no envía nada. Mejor silencio que respuesta tardía.

Cuando en un turno posterior **una llamada a OpenAI vuelve a responder OK**:

1. El callback `check_and_send_recovery(client_id)` (fire-and-forget post-éxito del grafo) hace `GET` al flag.
2. Si el flag existe → `DEL` + POST `tipo_alerta=openai_quota_recovered` al webhook de alertas.
3. El grupo recibe: `✅ Créditos OpenAI recargados. Bot en funcionamiento.`

No hay cola de mensajes pendientes. Los mensajes que se perdieron durante el outage se perdieron.

## Archivos involucrados

| Archivo | Rol |
|---|---|
| `bot-service/trebol_bot/integrations/openai_quota_fallback.py` | `handle_openai_quota_error()` + `check_and_send_recovery()` |
| `bot-service/trebol_bot/agent/graph.py` | Detección de `RateLimitError` en `except` de `handle_message()` + recovery check post-success |
| `workflows/alertasvendedores_test.json` | Switch con ramas `openai_quota` y `openai_quota_recovered` |
| `workflows/alertasvendedores_prod.json` | Idem prod |

## Redis keys

| Key | TTL | Qué hace |
|---|---|---|
| `bot:{client_id}:openai_quota_alert_sent` | **sin TTL** (permanente) | Dedup global. Mientras exista, no se manda nueva alerta. Valor = timestamp epoch. |
| `bot:{client_id}:{phone}:bot_off` | 21600s (6h) | Silencia el chat específico que disparó la 429. Razón = `openai_quota:{code}`. |

**Cliente IDs por entorno** (clave para la Redis key):
- test: `trebol` → key `bot:trebol:openai_quota_alert_sent`
- prod: `trebol-prod` → key `bot:trebol-prod:openai_quota_alert_sent`

## Workflows n8n

Ambos (`GyW7SjZluIdZyAYt_9LIO` test, `4JLhwQIiYGHMYfdIRBoMO` prod) tienen:

1. **Switch** con 2 ramas nuevas: `openai_quota` y `openai_quota_recovered`.
2. **Code nodes** `Formatear OpenAI Quota` y `Formatear OpenAI Recovered` que arman el texto del mensaje al grupo.
3. **`Check Horario` con bypass** para ambos tipos → las alertas operativas se mandan 24/7, no esperan la franja comercial (la de ventas sí la espera).

Mensajes:

```
🚨 *Créditos OpenAI agotados.*

El bot está pausado hasta que se recarguen los créditos.

🔗 Recargar: https://platform.openai.com/settings/organization/billing

⏰ 19/4/2026, 10:21:xx
```

```
✅ *Créditos OpenAI recargados.*

Bot en funcionamiento.

⏰ 19/4/2026, 10:30:xx
```

## Procedimiento cuando llega la alerta

1. Entrás a https://platform.openai.com/settings/organization/billing y recargás créditos (o cambiás a otra org/key).
2. **Nada que hacer en el bot** — cuando el próximo cliente escriba, el grafo llama a OpenAI, responde OK, se dispara `check_and_send_recovery` automáticamente y llega `✅ recargados` al grupo.
3. Chats que quedaron con `bot_off` por la caída: TTL 6h. Cualquiera de los 2 caminos los recupera:
   - Automático: el TTL expira, bot vuelve a responder al próximo mensaje del cliente.
   - Manual: `bash scripts/bot-on.sh <phone> <env>` reactiva al instante ese chat.

## Cambiar la API key en caliente (no recarga)

Si preferís cambiar de key en vez de recargar la actual (caso real 2026-04-19):

```bash
# 1. Editar el .env de prod
vi /root/kairos-infrastructure/environments/production/trebol/.env
# reemplazar OPENAI_API_KEY=<nueva>

# 2. Restart solo el bot (no afecta n8n, chatwoot ni evolution)
cd /root/kairos-infrastructure/environments/production/trebol
docker compose up -d --no-deps --force-recreate trebol-prod-bot

# 3. Verificar que arrancó OK y la key responde
docker exec trebol-prod-bot python3 -c "
import httpx, os
r = httpx.post('https://api.openai.com/v1/chat/completions',
  headers={'Authorization':f'Bearer {os.environ[\"OPENAI_API_KEY\"]}',
           'Content-Type':'application/json'},
  json={'model':'gpt-4.1-mini','messages':[{'role':'user','content':'test'}],'max_tokens':3})
print(r.status_code, r.json()['choices'][0]['message']['content'][:30] if r.status_code==200 else r.text[:100])
"
```

El flag `openai_quota_alert_sent` sigue presente hasta que llegue un mensaje real que active `check_and_send_recovery`. Si querés mandar la alerta `✅ recargados` al grupo manualmente (sin esperar un cliente):

```bash
# Disparar alerta recovery a mano desde el bot
docker exec trebol-prod-bot python3 -c "
import httpx
httpx.post('http://trebol-prod-n8n:5678/webhook/alertas-vendedores',
  json={'tipo_alerta':'openai_quota_recovered'}, timeout=15)
print('sent')
"
# Y borrar el flag Redis (opcional — si llega un mensaje real sin borrarlo,
# el callback recovery se ejecuta una sola vez gracias al SET NX)
docker exec trebol-prod-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning \
  DEL "bot:trebol-prod:openai_quota_alert_sent"
```

## Reset manual del flag (sin mandar alerta)

Si por algún motivo querés que la **próxima** 429 dispare alerta de nuevo (ej: ya corregiste el problema y estás testeando):

```bash
# Test
docker exec trebol-test-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning \
  DEL "bot:trebol:openai_quota_alert_sent"

# Prod
docker exec trebol-prod-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning \
  DEL "bot:trebol-prod:openai_quota_alert_sent"
```

## Testeo (inyectar error sintético)

Para verificar el handler sin esperar que OpenAI falle de verdad, se puede correr dentro del container:

```bash
docker exec trebol-test-bot python3 -c "
import asyncio, openai, httpx
from trebol_bot.integrations.openai_quota_fallback import (
    handle_openai_quota_error, check_and_send_recovery
)
from trebol_bot.memory.redis_client import get_redis

async def main():
    req = httpx.Request('POST','https://api.openai.com/v1/chat/completions')
    resp = httpx.Response(429, request=req,
      json={'error':{'code':'insufficient_quota'}})
    err = openai.RateLimitError(message='x', response=resp,
      body={'error':{'code':'insufficient_quota'}})

    r = await get_redis()
    await r.delete('bot:trebol:openai_quota_alert_sent')

    # Simular 2 errores — la 2da debe dedupear
    await handle_openai_quota_error(err, chat_id='999',
      phone='5491150635028@s.whatsapp.net', client_id='trebol')
    await handle_openai_quota_error(err, chat_id='999',
      phone='5491150635028@s.whatsapp.net', client_id='trebol')

    # Recovery — debe mandar alerta y borrar el flag
    await check_and_send_recovery('trebol')

asyncio.run(main())
"
```

## Gaps conocidos (backlog)

- `rate_limit_exceeded` (transitorio — RPM/TPM excedido, se resuelve en 1 min) se trata igual que `insufficient_quota` (crédito agotado). Si empieza a generar falsos positivos, diferenciar.
- No hay fallback a otro modelo (Claude, local) durante el outage. Por diseño del sprint — se decidió que silencio + alerta es suficiente para 1 cliente en prod. Reevaluar al sumar un segundo cliente pago.
- No hay cron proactivo que pegue a `/v1/dashboard/billing/credit_grants` (OpenAI lo bloquea para project API keys — solo admin keys). Si se creara una admin key, podría monitorearse el saldo y avisar *antes* de llegar a 0.

## Referencias

- Spec completa: `specs/2026-04-19-bot-fallback-openai-quota-ratelimit.md`
- Commit: `40d94f3 feat(bot): alerta + bot-off ante 429 insufficient_quota de OpenAI`
- [[Operar_Bot]] — runbook general del bot
- [[Observabilidad_Langfuse]] — dónde ver las traces con status=ERROR de RateLimitError
