---
tags: [langgraph, multi-tenant, onboarding, fangio]
---

# Onboarding de un nuevo cliente al bot LangGraph

Agregar un cliente nuevo al bot-service no requiere cambios de código. Solo archivos de config + un nuevo servicio Docker.

## Checklist completo (ejemplo: FangioBot)

### 1. Config YAML del cliente

Crear `bot-service/configs/fangio.yaml` copiando `trebol.yaml` y editando:

```yaml
client_id: fangio
nombre_agente: Facundo           # Nombre del asesor virtual
nombre_agencia: FangioBot
ubicacion: ""                    # dirección de la agencia
horario: "L-V 9-18"

prompt_file: prompts/fangio.txt  # relativo a configs/

llm_model: gpt-4.1-mini
llm_temperature: 0.2

mongo_collection: propiedades-fangio   # colección Atlas para este cliente

sheets_crm_doc_id: "1ABC..."           # doc ID del CRM de Fangio (no es secret)
sheets_crm_gid: 0
sheets_pedidos_gid: 2004343376

debounce_seconds: 3.0
```

### 2. System prompt

Crear `bot-service/configs/prompts/fangio.txt` con el prompt del agente de Fangio.
Puede basarse en `prompts/trebol.txt` — ajustar identidad, tono, reglas de negocio.

El prompt NO lleva credenciales ni URLs hardcodeadas — esas vienen del YAML y el env.

### 3. MongoDB Atlas

- En Atlas: crear colección `propiedades-fangio` (o el nombre definido en el YAML)
- Crear vector index `vector_index` en esa colección (mismo schema que Trébol)
- Configurar `SheetsToMongo` workflow en n8n para sincronizar el inventario de Fangio

### 4. Google Sheets CRM

- Crear hoja con las mismas columnas que el CRM de Trébol:
  `FECHA | VENDEDOR | TEL | NOMBRE CLIENTE | VEHICULO DE INTERÉS | VEHICULO QUE ENTREGA | PRESUPUESTO APROXIMADO | FINANCIA | ESTADO DEL CLIENTE | plataforma | PROX CONTACTO | NOTAS | ALERTA_ENVIADA`
- Compartir el documento con el service account: `n8n-sheets-access@n8napis-483300.iam.gserviceaccount.com`
- Copiar el doc ID (de la URL de Sheets) y ponerlo en `fangio.yaml` → `sheets_crm_doc_id`

### 5. Variables de entorno (.env del environment)

Las secrets son las mismas que Trébol (comparten infra test):
- `OPENAI_API_KEY` — mismo
- `MONGODB_URI` — mismo (mismo cluster Atlas)
- `GOOGLE_SA_JSON_B64` — mismo service account
- `LANGFUSE_*` — mismo o crear org nueva en Langfuse

Si Fangio tiene infra propia (ambiente separado), crear `.env` propio con sus valores.

### 6. Docker Compose — nuevo servicio

En `environments/test/trebol/docker-compose.yml` (o en el environment de Fangio):

```yaml
  fangio-test-bot:
    build:
      context: ../../../bot-service
      dockerfile: Dockerfile
    container_name: fangio-test-bot
    restart: unless-stopped
    environment:
      - CLIENT_ID=fangio             # ← esto determina qué YAML carga
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - CHATWOOT_URL=https://${FANGIO_CHATWOOT_DOMAIN}
      - CHATWOOT_TOKEN=${FANGIO_CHATWOOT_TOKEN}
      - CHATWOOT_ACCOUNT_ID=${FANGIO_CHATWOOT_ACCOUNT_ID}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - MONGODB_URI=${MONGODB_URI}
      - GOOGLE_SA_JSON_B64=${GOOGLE_SA_JSON_B64}
      - N8N_INTERNAL_URL=${N8N_INTERNAL_URL}
      - LANGFUSE_PUBLIC_KEY=${LANGFUSE_PUBLIC_KEY}
      - LANGFUSE_SECRET_KEY=${LANGFUSE_SECRET_KEY}
      - LANGFUSE_HOST=${LANGFUSE_HOST}
    networks:
      - trebol-test-network
      - traefik_public
    depends_on:
      trebol-test-redis:
        condition: service_healthy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.fangio-bot.rule=Host(`${FANGIO_BOT_DOMAIN}`)"
      - "traefik.http.routers.fangio-bot.entrypoints=websecure"
      - "traefik.http.routers.fangio-bot.tls.certresolver=letsencrypt"
      - "traefik.http.services.fangio-bot.loadbalancer.server.port=8000"
      - "traefik.docker.network=traefik_public"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
```

Agregar al `.env`:
```
FANGIO_BOT_DOMAIN=test-fangio.bot.kairosaisolutions.com
FANGIO_CHATWOOT_DOMAIN=test-fangio.chatwoot.kairosaisolutions.com
FANGIO_CHATWOOT_TOKEN=...
FANGIO_CHATWOOT_ACCOUNT_ID=...
```

### 7. Webhook Chatwoot

En Chatwoot de Fangio: Settings → Integrations → Webhooks → agregar:
```
URL: https://test-fangio.bot.kairosaisolutions.com/webhook/chatwoot
Events: Message Created
```

### 8. DNS

En Hetzner: registro A → `test-fangio.bot.kairosaisolutions.com` → IP del VPS (`46.62.235.162`)

### 9. Deploy

```bash
docker compose up -d --no-deps fangio-test-bot
docker logs fangio-test-bot --follow
```

El log de startup debe mostrar:
```json
{"client_id": "fangio", "nombre_agente": "Facundo", "nombre_agencia": "FangioBot", "llm_model": "gpt-4.1-mini", ...}
```

### 10. Test rápido

```bash
curl -X POST https://test-fangio.bot.kairosaisolutions.com/webhook/chatwoot \
  -H "Content-Type: application/json" \
  -d '{"event":"message_created","message_type":"incoming","content":"Hola","conversation":{"id":"1"},"sender":{"identifier":"5491155500001","name":"Test"}}'
```

---

## Qué es compartido vs aislado entre clientes

| Recurso | Compartido | Aislado |
|---|---|---|
| Código Python | ✅ mismo binario | — |
| Redis (debounce/historial) | ✅ mismo Redis | por namespace `bot:{client_id}:{phone}:*` |
| MongoDB conexión | ✅ mismo cluster | por `mongo_collection` en YAML |
| Google Sheets creds | ✅ mismo SA | por `sheets_crm_doc_id` en YAML |
| Langfuse traces | ✅ misma org | por `session_id={client_id}:{chat_id}` |
| OpenAI API key | ✅ misma key | — |
| Chatwoot | ❌ separado | cuenta/instancia propia |
| System prompt | ❌ separado | `configs/prompts/{client_id}.txt` |
| Config comportamiento | ❌ separado | `configs/{client_id}.yaml` |
| Container Docker | ❌ separado | `CLIENT_ID={client_id}` |

## Links

- [[LangGraph_Bot]] — arquitectura del bot
- [[FangioBot]] — contexto del segundo cliente
- `bot-service/configs/trebol.yaml` — referencia de YAML
