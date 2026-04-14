# GuardarFeedbackConversacion — Notas de desarrollo

Workflow: `GuardarFeedbackConversacion` | ID test: `s3TGQnFA0EG27pXv`
Estado: En desarrollo (test) — aún no deployado a prod.

---

## Propósito

Captura conversaciones etiquetadas con `bien` o `mal` en Chatwoot y las guarda como vectores en MongoDB Atlas para RAG behavioral training del bot.

---

## Flujo

```
Webhook Chatwoot (conversation_updated)
  → Extraer Datos Label      [Code]    detecta si el evento es aplicación de label y cuál
  → Tiene Label Feedback     [If]      pasa si resultado = 'exitosa' o 'fallida', sino → No Operation
  → Get Mensajes Chatwoot    [HTTP]    GET /api/v1/accounts/{account_id}/conversations/{conv_id}/messages
  → Formatear Conversacion   [Code]    construye pageContent = "Cliente: ...\nSanti: ..."
  → Check Si Existe          [MongoDB] busca por conversation_id o metadata.conversation_id
  → Decide Accion            [Code]    action = 'insert' | 'update'
  → Switch Accion            [Switch]
      → insert: MongoDB Atlas Vector Store (direct)
      → update: Borrar Anterior → Preparar Para Insertar → MongoDB Atlas Vector Store
        (sub-nodes: Default Data Loader + Embeddings OpenAI)
```

---

## Nodos clave

### Extraer Datos Label
Detecta si el evento de Chatwoot es una **aplicación de label** (no mensaje, no asignación).

Chatwoot `conversation_updated` dispara para TODO. Diferenciamos por `changed_attributes`:
- Label aplicado: `changed_attributes` = array con item que tiene key `cached_label_list` o `label_list`
- Mensaje recibido: `changed_attributes` = array con keys `updated_at`, `waiting_since`, etc.

```javascript
const changedAttrs = body.changed_attributes;
let labelsChangedHere = false;
if (Array.isArray(changedAttrs)) {
  labelsChangedHere = changedAttrs.some(
    a => a.cached_label_list != null || a.label_list != null
  );
} else if (changedAttrs && typeof changedAttrs === 'object') {
  labelsChangedHere = 'cached_label_list' in changedAttrs || 'label_list' in changedAttrs;
}
const TARGET = { 'bien': 'exitosa', 'mal': 'fallida' };
let resultado = '';
if (labelsChangedHere) {
  for (const [lbl, val] of Object.entries(TARGET)) {
    if (labels.includes(lbl)) { resultado = val; break; }
  }
}
```

### Get Mensajes Chatwoot
```
GET https://{CHATWOOT_DOMAIN}/api/v1/accounts/{CHATWOOT_ACCOUNT_ID}/conversations/{conv_id}/messages
```
- Retorna **últimos 20 mensajes** ordenados ascendente.
- Para conversaciones largas (>20 mensajes), los mensajes del bot pueden no estar en esos 20.
- **Pending**: paginar con `?before_id=X` para conversaciones con historia larga.

### Formatear Conversacion
Filtra `message_type`:
- 0 = incoming (cliente → `rol: 'cliente'`)
- 1 = outgoing (bot/agente → `rol: 'bot'`)
- 2 = activity (cambios de label, asignaciones → excluir)
- `private: true` = nota privada del admin → va al campo `descripcion`

```javascript
const pageContent = mensajes
  .map(m => `${m.rol === 'cliente' ? 'Cliente' : 'Santi'}: ${m.texto}`)
  .join('\n')
  .slice(0, 7000);
```

### Default Data Loader
Config crítica para que funcione correctamente:
```json
{
  "jsonMode": "expressionData",
  "jsonData": "={{ $json.pageContent }}",
  "options": {
    "metadata": {
      "metadataValues": [
        {"name": "conversation_id", "value": "={{ $json.conversation_id }}"},
        {"name": "resultado",       "value": "={{ $json.resultado }}"},
        {"name": "descripcion",     "value": "={{ $json.descripcion }}"},
        {"name": "total_mensajes",  "value": "={{ $json.total_mensajes }}"}
      ]
    }
  }
}
```
**Gotcha**: Si se omite `jsonMode: "expressionData"` + `jsonData`, el nodo trata todo el objeto JSON como blob y crea un documento por cada campo/línea (bug de 226 docs).

### MongoDB Atlas Vector Store
- Collection: `conversaciones-feedback-test`
- Vector index: `vector_index_feedback` (debe crearse manualmente en Atlas)
- Credencial: `MongoDB account` (id: `LdUrhcJ7FxBoD4fF`)
- Index specs (para crear):
  ```json
  {
    "fields": [{
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    }]
  }
  ```

---

## Webhook Chatwoot (prod configuración)

En Chatwoot test, el webhook está registrado como:
- ID=2 | URL: `https://test-trebol.n8n.kairosaisolutions.com/webhook/feedback-conversacion`
- Subscriptions: `["conversation_updated"]`

---

## Bugs resueltos

### Bug 1: 226 documentos en lugar de 1
**Causa**: Default Data Loader sin `jsonMode: "expressionData"` parseaba el objeto JSON completo como múltiples documentos.
**Fix**: Configurar `jsonMode`, `jsonData`, metadata explícita.

### Bug 2: `$json` stripped en expresiones
**Causa**: Python inline via SSH `python3 -c "..."` interpreta `$json` como variable bash vacía.
**Fix**: Siempre usar `scp` + archivo `/tmp/script.py` → `python3 /tmp/script.py` en el VPS.

### Bug 3: Duplicados (2 docs por conversación)
**Causa**: Chatwoot dispara `conversation_updated` 2 veces cuando se aplica un label.
**Mitigación**: El patrón Check Si Existe → Decide Accion garantiza upsert (no doble insert).
**Nota**: Puede seguir habiendo race condition si las 2 ejecuciones son exactamente simultáneas.

### Bug 4: resultado siempre vacío
**Causa A**: Default `labelsChangedHere = true` → cualquier evento activaba el check pero con key incorrecto.
**Causa B**: Key incorrecto: chequeaba `a.labels` pero Chatwoot v3 usa `a.cached_label_list` / `a.label_list`.
**Fix**: default `false` + keys correctos (ver código arriba).

### Bug 5: Mensajes del bot no aparecen en API
**Diagnóstico**: La conversación de test (conv 58) era manual, sin respuestas reales del bot.
**En realidad**: Conv 3 tiene 595 mensajes tipo 0 y 291 tipo 1. Pero los últimos 20 son todos tipo 0 (bot dejó de responder hace días en esa conv).
**Para test real**: Usar una conversación donde el bot respondió recientemente.
**Pending**: Agregar paginación para conversaciones largas.

---

## Cuenta Chatwoot test

- Account ID: **2** (no 1 — la cuenta se llama "el trebol")
- API token: `gCgu45T87QqNfWdZoEGnrtEY`
- Env var `CHATWOOT_ACCOUNT_ID` en n8n test debe ser `2`

---

## Pendientes

- [ ] Verificar que `CHATWOOT_ACCOUNT_ID=2` está seteado correctamente en n8n test env
- [ ] Test end-to-end: aplicar label a una conversación real (conv 3 o nueva) donde bot respondió recientemente
- [ ] Crear vector index `vector_index_feedback` en MongoDB Atlas si no existe
- [ ] Considerar paginación en Get Mensajes para conversaciones con >20 mensajes
- [ ] Deploy a prod cuando test esté validado

---

## Notas de Chatwoot

- `message_type` en API: 0=incoming, 1=outgoing, 2=activity
- En Rails/DB: `type=incoming` → `message_type=0`, `type=outgoing` → `message_type=1`
- Bot messages (via n8n HTTP → Chatwoot API) se guardan como `message_type=1, sender_type=User`
- `changed_attributes` es ARRAY cuando viene de webhook `conversation_updated`
