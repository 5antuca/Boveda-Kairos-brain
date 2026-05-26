---
tags: [fangiobot, sprint6, estado, sesion]
fecha: 2026-04-15
estado: ✅ COMPLETADO — Pipeline end-to-end funcionando
---

# FangioBot Sprint 6 — Estado final 2026-04-15

## ✅ Pipeline end-to-end funciona

El bot recibe mensajes de WhatsApp via Evolution API, los procesa con el pipeline v2, y responde al usuario en WhatsApp.

**Validado:** mensaje "hola" → bot responde "¡Hola! ¿En qué te puedo ayudar hoy? 😊" en WhatsApp.

---

## Bugs encontrados y resueltos (sesión completa)

### Sesión anterior (contexto comprimido)
- ✅ `Normalizar Payload`: leía `$input.first().json` en vez de `.json.body || .json` → fijo
- ✅ `Construir Estado Comprimido`: 4 branches paralelos sin Merge → eliminados (rediseño v2)
- ✅ `Extractor LLM Nano`: `method: POST` faltaba → n8n hacía GET → 400 error → fijo
- ✅ `AI Agent`: `toolsAgent` no existe en n8n 2.2.4 → usar `openAiFunctionsAgent`
- ✅ `AI Agent`: faltaba `promptType: define` + `text` expression → fijo
- ✅ `Enviar Mensaje Evolution`: `$env` bloqueado → `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` → fijo
- ✅ NAT hairpinning: Evolution → n8n usaba URL pública → URL interna Docker fijo

### Esta sesión (continuación)
- ✅ **Processing lock stuck**: lock sin TTL → si execution falla, queda pegado para siempre → fix: TTL 120s en `Redis SET Processing Lock`
- ✅ **Bull queue "Missing key"**: n8n 2.2.4 bug — Bull job key expira antes que el worker reporte → fix: `QUEUE_BULL_SETTINGS_LOCK_DURATION=600000` (10 min)
- ✅ **EVOLUTION_URL NAT hairpin**: `Enviar Mensaje Evolution` hacía HTTP al URL público desde el worker → timeout → fix: `EVOLUTION_URL=http://trebol-test-evolution-api:8080` + worker en red `traefik_public`
- ✅ **`docker restart` no aplica env vars**: hay que usar `docker compose up -d` para recrear el container con nuevas variables
- ✅ **`Enviar Mensaje Evolution`: method GET**: faltaba `"method": "POST"` en el nodo → `404 Cannot GET /message/sendText/el-trebol` → fijo
- ✅ **`POST Lead a FangioBot`: JSON inválido**: body malformado + endpoint no existe → desconectado (pendiente spec separada)
- ✅ **`Tool: opciones_financiacion`: referencia rota**: `$('Preparar System Prompt')` → `$('Construir Prompt Block')` → fijo
- ✅ **DEL Processing Lock**: solo conectado desde `Enviar Mensaje Evolution` → si falla, lock queda pegado → fix: conectado desde todos los nodos terminales

---

## Estado del workflow al cerrar

**Archivo local:** `/root/apps/fangiocrm-infra/fangiobot-master.json`  
**Workflow ID:** `1cldlRu3k1Js_jn0uUNGD` (`FangioBot Master v1`)  
**Nodos:** 33  
**Estado:** activo, pipeline funcional end-to-end

### docker-compose.yml cambios activos
```yaml
n8n-worker:
  environment:
    - QUEUE_BULL_SETTINGS_LOCK_DURATION=600000
    - QUEUE_BULL_SETTINGS_LOCK_RENEW_TIME=60000
    - QUEUE_BULL_SETTINGS_STALLED_INTERVAL=300000
    - EVOLUTION_URL=http://trebol-test-evolution-api:8080
    - OPENAI_API_KEY=${OPENAI_API_KEY}
    - N8N_BLOCK_ENV_ACCESS_IN_NODE=false
  networks:
    - default
    - traefik_public
```

---

## Próximo sprint: Chat Monitor en FangioBot

Spec creada: `specs/2026-04-15-fangiocrm-chat-evolution-integration.md`

Resumen de lo que hay que construir:
1. `POST /api/webhook/evolution` en FangioBot — recibe mensajes de n8n, guarda en MongoDB
2. Adaptar `PATCH /api/leads/[id]/bot` — llama webhook n8n al toglear
3. Nuevo workflow n8n `FangioBot BotToggle` — recibe de FangioBot, setea Redis
4. Dos nodos nuevos en FangioBot Master: `Forward Mensaje` + `Forward Respuesta`

La UI `/chats` ya existe y consume los endpoints de leads/messages. Solo faltan los datos reales llegando vía Evolution API.

---

## Comandos útiles

```bash
# Ver logs en tiempo real
docker logs fangiocrm-n8n-worker-1 -f --since 1m

# Limpiar estado Redis de un número (para re-testear)
docker exec 77b6b9f76861_fangiocrm-n8n-redis redis-cli KEYS "*el-trebol*" | xargs redis-cli DEL

# Verificar lead en Redis
docker exec 77b6b9f76861_fangiocrm-n8n-redis redis-cli GET "el-trebol:5491150635028:lead"

# Aplicar cambios de docker-compose (NO usar docker restart para env vars)
cd /root/apps/fangiocrm-infra && docker compose up -d n8n-worker

# Deploy workflow
python3 -c "
import json
with open('fangiobot-master.json') as f: wf = json.load(f)
payload = {'name': wf['name'], 'nodes': wf['nodes'], 'connections': wf['connections'], 'settings': wf.get('settings', {}), 'staticData': None}
with open('/tmp/deploy.json', 'w') as f: json.dump(payload, f)
"
curl -sS -X PUT "https://n8n.fangiocrm.com/api/v1/workflows/1cldlRu3k1Js_jn0uUNGD" \
  -H "X-N8N-API-KEY: <api-key>" \
  -H "Content-Type: application/json" \
  -d @/tmp/deploy.json
```
