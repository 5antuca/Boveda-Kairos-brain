---
tags: [langgraph, bot, prod, deploy, runbook, cutover]
fecha: 2026-04-18
estado: vigente
---

# Bot Python en PROD — Deploy y operación

Cutover del bot LangGraph Python a producción completado el **2026-04-18**. El workflow n8n `Trebol v4 Test` (prod) quedó desactivado; el bot Python procesa todos los mensajes entrantes al inbox `trebolllllllll` (ID 5, account 4).

## Estado verificado (post-cutover)

| Componente | Estado |
|---|---|
| `trebol-prod-bot` | Up (healthy) · 145MB/512MB · CPU <1% · image `trebol-trebol-prod-bot` |
| Webhook Chatwoot ID 2 | `https://trebol.bot.kairosaisolutions.com/webhook/chatwoot` · sub `message_created` |
| TLS | Traefik + Let's Encrypt · verify_result=0 · HTTP 200 en `/health` |
| DNS `trebol.bot.kairosaisolutions.com` | 46.62.235.162 · A record en Hetzner |
| Workflow `Trebol v4 Test` (prod) | `active=false` ✓ desactivado |
| Workflow `AlertasVendedores` | `active=true` ✓ recibe POST del bot |
| Workflow `Tool - Simulador Cuotas` | `active=true` ✓ |
| Langfuse traces | emitiendo `whatsapp_turn` con tags `env:prod`, `trebol-prod`, `trebol-bot` |
| Redis history | `bot:trebol-prod:{phone}:history` (JSON string, TTL 7d, max 20 msgs) |

## Infra prod — diferencias con test

| Variable | TEST | PROD |
|---|---|---|
| `CLIENT_ID` | `trebol` | `trebol-prod` |
| `CHATWOOT_ACCOUNT_ID` | `2` | `4` |
| `CHATWOOT_INBOX_ID` (filtro YAML) | `2` | `5` |
| `CHATWOOT_URL` | `test-trebol.chatwoot.kairosaisolutions.com` | `trebol.chatwoot.kairosaisolutions.com` |
| Bot domain | `test-trebol.bot.kairosaisolutions.com` | `trebol.bot.kairosaisolutions.com` |
| Container | `trebol-test-bot` | `trebol-prod-bot` |
| Config YAML | `configs/trebol.yaml` | `configs/trebol-prod.yaml` |
| Redis namespace | `bot:trebol:*` | `bot:trebol-prod:*` |
| WhatsApp alerts group | test group | `120363404968281666@g.us` (Alertas Trebol) |
| CRM Sheets doc | test doc | `1No6VzcVctpWYIEi6yjqfrnaCIOdB3Kw0Ou4Mqarg_b8` |
| MongoDB collection | `propiedades` (compartida) | `propiedades` (compartida) |
| Evolution instance | test | `trebolfinal` |

El prompt (`configs/prompts/trebol.txt`) es el mismo en ambos — cambiar el prompt afecta a los dos stacks al mismo tiempo.

## Cómo se rutea un mensaje en prod

```
1. WhatsApp → Evolution API (trebolfinal) → webhook /chatwoot/webhook/trebolfinal
2. Chatwoot prod crea Message → dispara EventDispatcherJob → WebhookJob
3. WebhookJob POST https://trebol.bot.kairosaisolutions.com/webhook/chatwoot
   (resolución DNS estática via extra_hosts → 172.18.0.100 = Traefik)
4. Traefik → trebol-prod-bot:8000/webhook/chatwoot
5. Bot LangGraph procesa: debounce 3s → agent → tools → LLM → respuesta
6. Bot POST Chatwoot API → /accounts/4/conversations/{id}/messages (3 burbujas + N fotos)
7. Chatwoot envía vía Evolution API → cliente
8. CRM extraction (async) → Sheets + alertas n8n si aplica
```

## Hairpin NAT — extra_hosts en prod

Los containers del stack prod tienen resolución estática del dominio público del bot para evitar NXDOMAIN cacheado:

```yaml
extra_hosts:
  - "trebol.bot.kairosaisolutions.com:172.18.0.100"  # Traefik en traefik_public
```

Servicios con este extra_host (5 en total):
- `trebol-prod-n8n`
- `trebol-prod-n8n-worker`
- `trebol-prod-chatwoot-web`
- `trebol-prod-chatwoot-sidekiq` ← **crítico**: emite los webhooks hacia el bot
- `trebol-prod-evolution-api`

Incidente que motivó el fix (2026-04-18): al crear el DNS en Hetzner después de que sidekiq ya había intentado resolver el dominio, el worker Ruby cacheaba el NXDOMAIN en memoria. Mensajes entrantes fallaban con `getaddrinfo: Name does not resolve` hasta recrear el container.

## Alertas — diferencias críticas prod

El workflow n8n `AlertasVendedores` (prod) lee del env de n8n:

```
WHATSAPP_ALERTS_GROUP_ID=120363404968281666@g.us
EVOLUTION_INSTANCE_NAME=trebolfinal
EVOLUTION_DOMAIN=trebol.evo.kairosaisolutions.com
```

El group_id **es distinto al de test**. Al promover el workflow test → prod verificar siempre que `environments/production/trebol/.env` tenga el ID correcto.

## Observabilidad en Langfuse (prod)

- **URL**: https://us.cloud.langfuse.com
- **Filtro para ver solo prod**: tag `env:prod` o `trebol-prod`
- **Buscar sesión**: `sessionId = {phone}` (phone sin `@s.whatsapp.net`, ej: `5491150267508`)
- **Metadata por trace**: `env`, `bot_version`, `client_id`, `chatwoot_chat_id`, `phone_raw`, `source`
- **Estructura**: `whatsapp_turn` (trace) → `LangGraph` (span) → `agent`/`tools` → `ChatOpenAI` generations + `response_sent`

## Operación — comandos útiles prod

```bash
# Logs del bot
docker logs -f trebol-prod-bot

# Health check público
curl https://trebol.bot.kairosaisolutions.com/health

# Estado de un teléfono (bot off)
docker exec trebol-prod-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning \
  GET "bot:trebol-prod:{phone}:bot_off"

# Historia del cliente
docker exec trebol-prod-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning \
  GET "bot:trebol-prod:{phone}@s.whatsapp.net:history"

# Apagar bot para un cliente (TTL 72h por defecto)
bash scripts/bot-off.sh {phone} prod

# Prender bot
bash scripts/bot-on.sh {phone} prod

# Listar últimas conversaciones de prod (account 4)
docker exec trebol-prod-bot python3 -c "
import httpx, os
r = httpx.get('https://trebol.chatwoot.kairosaisolutions.com/api/v1/accounts/4/conversations?status=open',
             headers={'api_access_token': os.environ['CHATWOOT_TOKEN']})
for c in r.json()['data']['payload'][:10]:
    print(c['id'], c['meta']['sender'].get('name'), c['meta']['sender'].get('phone_number'))
"
```

## Rollback (si hiciera falta)

Para volver al workflow n8n prod:

1. Apuntar webhook Chatwoot ID 2 al n8n:
   ```
   PATCH https://trebol.chatwoot.kairosaisolutions.com/api/v1/accounts/4/webhooks/2
   body: {"webhook": {"url": "https://trebol.n8n.kairosaisolutions.com/webhook/<uuid>"}}
   ```
2. Activar el workflow viejo: `UPDATE workflow_entity SET active=true WHERE id='wf4ts1WKcpOaE90A__FkD';`
3. Restart n8n: `docker restart trebol-prod-n8n trebol-prod-n8n-worker`
4. `docker stop trebol-prod-bot` (opcional)

El workflow n8n prod tiene **F1/F2/F3 no deployados** (139 nodos vs 149 en test). Si se hace rollback para emergencia, tener presente que pierden context pinning y drift detector.

## Incidente de cutover (2026-04-18)

**Mensaje de Hugo Benitez (conv 368) quedó sin respuesta**. Causa: cuando se creó el webhook en Chatwoot prod, el DNS del bot aún no estaba propagado (usuario puso el record como `trebol.bot.kairosaisolutions.com.kairosaisolutions.com` inicialmente). Sidekiq cacheó NXDOMAIN, y cuando el DNS se corrigió el cache persistió.

Fix permanente: extra_hosts (commit `29ea91f`). Mensaje de Hugo re-despachado manualmente via `docker exec trebol-prod-bot python3 -c "httpx.post('http://localhost:8000/webhook/chatwoot', json=payload)"` con el payload real extraído de `Message.find(10574).webhook_data` en Rails runner.

## Links

- [[LangGraph_Bot]] — overview del proyecto
- [[Operar_Bot]] — runbook general (apagar/prender/debug)
- [[Observabilidad_Langfuse]] — debugging con traces
- [[Trebol_Prod_Architecture]] — infra prod completa
