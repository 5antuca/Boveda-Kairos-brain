---
tags: [fangiobot, sprint6, estado, sesion]
fecha: 2026-04-15
estado: EN PROGRESO — Extractor fix pusheado, pendiente test
---

# FangioBot Sprint 6 — Estado de sesión 2026-04-15

## Qué se hizo en esta sesión

### Infra resuelta
- ✅ Tenant `el-trebol` en MongoDB Atlas — operativo, `/api/agent/context?instance=el-trebol` devuelve 200
- ✅ Sesión Evolution API conectada (`connectionStatus: open`, número `5491123809397`)
- ✅ Webhook Evolution → n8n: `http://fangiocrm-n8n-master:5678/webhook/fangiobot-master` (URL interna Docker, resuelve NAT hairpinning)
- ✅ Workflow activo en n8n (`1cldlRu3k1Js_jn0uUNGD`, `FangioBot Master v1`)

### Bugs encontrados y resueltos
- ✅ `Normalizar Payload`: leía `$input.first().json` en vez de `.json.body || .json` → fijo
- ✅ `Construir Estado Comprimido`: 4 branches paralelos sin Merge → eliminados (rediseño)
- ✅ `Extractor LLM Nano`: `method: POST` faltaba → n8n hacía GET → 400 error → fijo

### Rediseño v2 implementado
- ✅ 47 nodos → 33 nodos
- ✅ 4 Redis keys paralelas → 1 key `{chat_id}:lead` (JSON unificado)
- ✅ Sin guardias, sin router, sin switch, sin regex
- ✅ Pipeline: Lock → Redis GET Lead → GET Tenant → Extractor Nano → Merge Lead → Construir Prompt Block → AI Agent → Guardar Contexto → (Redis SET Lead | IF Bot Off | Enviar | POST Lead)

## Estado al cerrar la sesión

**Último error visto**: Extractor LLM Nano → 400 GET en vez de POST → FIJADO con `method: POST` en el JSON.

**Pendiente de validar** (próxima sesión):
1. Mandar WhatsApp al número `5491123809397` y verificar que el pipeline completo pase sin errores
2. Nodo más probable que falle siguiente: `Merge Lead` — verificar que `$('Redis GET Lead').item.json?.value` sea null o JSON válido en primer turno
3. Verificar que `Construir Prompt Block` genere el `systemPrompt` correctamente
4. Verificar que `AI Agent` reciba el systemPrompt y responda
5. Verificar que `Guardar Contexto` guarde el lead en Redis y que `respuesta_final` llegue a `Enviar Mensaje Evolution`

## Credenciales y accesos activos

- **n8n API Key**: JWT vigente hasta 2026-05-11 (ver Keys.md)
- **n8n URL**: https://n8n.fangiocrm.com
- **Workflow ID**: `1cldlRu3k1Js_jn0uUNGD`
- **Evolution instance**: `el-trebol` en `test-trebol.evo.kairosaisolutions.com`
- **API Key Evolution**: en `trebol-test-evolution-api` container env (`AUTHENTICATION_API_KEY`)
- **JSON local**: `/root/apps/fangiocrm-infra/fangiobot-master.json`

## Para retomar en próxima sesión

```
/prime-v4  ← carga contexto Trebol (no aplica acá, usar prime genérico)
```

Leer:
1. Este archivo
2. [[FangioBot_v2_Architecture]] — diseño completo
3. [[Docker_Networking_Gotchas]] — NAT hairpinning ya resuelto

Comando para ver logs en tiempo real mientras llega un WhatsApp:
```bash
docker logs fangiocrm-n8n-worker-1 -f --since 1m
```

Para verificar el lead guardado en Redis después de un turno:
```bash
docker exec 77b6b9f76861_fangiocrm-n8n-redis redis-cli -a 551ea4589d1f62e86de01e9d2d44f9af1f7c9bd252bcf945138082e79d8267dc GET "el-trebol:549XXXXXXXXX:lead"
```
(reemplazar `549XXXXXXXXX` con el número de quien mandó el mensaje)
