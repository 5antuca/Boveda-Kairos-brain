# Variables de entorno a agregar

## Vercel (FangioCRM)

```
N8N_INTERNAL_URL=https://n8n.fangiocrm.com
EVOLUTION_WEBHOOK_SECRET=a071e80e99427ab7dd7cfab3dfa0850cbcc47baada637493
```

Agregar en: https://vercel.com/dashboard → tu proyecto → Settings → Environment Variables

## n8n worker (ya aplicado en VPS)

```
FANGIOCRM_URL=https://www.fangiocrm.com
EVOLUTION_WEBHOOK_SECRET=a071e80e99427ab7dd7cfab3dfa0850cbcc47baada637493
```

---

## Archivos a crear/modificar en FangioCRM

| Archivo | Acción |
|---|---|
| `src/app/api/webhook/evolution/route.ts` | **CREAR** (reemplaza Twilio webhook) |
| `src/app/api/leads/[id]/bot/route.ts` | **CREAR** (nuevo endpoint toggle) |
| `src/models/Lead.ts` | Verificar campos: `tenantId`, `phone`, `botActive`, `turno` |
| `src/models/Message.ts` | Verificar campos: `fromMe`, `timestamp` |

Los archivos `.ts` listos para pegar están en esta carpeta (`code/`).

---

## BotToggle UI — cómo llamar desde el frontend

```tsx
// En tu componente de chat, donde está el switch:
async function toggleBot(leadId: string, currentlyActive: boolean) {
  await fetch(`/api/leads/${leadId}/bot`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: !currentlyActive })
  })
}
```

---

## Test manual del webhook (desde terminal)

```bash
# Simular mensaje entrante
curl -X POST https://www.fangiocrm.com/api/webhook/evolution \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: a071e80e99427ab7dd7cfab3dfa0850cbcc47baada637493" \
  -d '{
    "event": "message_received",
    "instance": "el-trebol",
    "phone": "5491150635028",
    "chat_id": "el-trebol:5491150635028",
    "tenantId": "el-trebol",
    "text": "hola quiero un auto",
    "fromMe": false,
    "timestamp": 1776256095197
  }'

# Simular respuesta del bot
curl -X POST https://www.fangiocrm.com/api/webhook/evolution \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: a071e80e99427ab7dd7cfab3dfa0850cbcc47baada637493" \
  -d '{
    "event": "bot_response",
    "instance": "el-trebol",
    "phone": "5491150635028",
    "tenantId": "el-trebol",
    "text": "¡Hola! ¿En qué te puedo ayudar?",
    "fromMe": true,
    "timestamp": 1776256096000
  }'
```
