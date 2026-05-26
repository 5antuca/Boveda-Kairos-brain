---
tags: [importante, evolution, test, sesion-pendiente, reconectar]
fecha: 2026-05-09
estado: PENDIENTE — abrir al inicio de próxima sesión
prioridad: alta
---

# ⚠️ IMPORTANTE — ABRIR EN PRÓXIMA SESIÓN

## Reconectar Evolution API del bot Trebol TEST

En la sesión del **2026-05-09** desconecté la sesión de Evolution API del número del chatbot **TEST** porque querías usar el mismo número físico de WhatsApp con otro agente por un rato.

**Hay que reconectar antes de seguir con cualquier trabajo del bot test.**

---

## Estado al desconectar

| Campo | Valor |
|---|---|
| Container | `trebol-test-evolution-api` |
| URL pública | `https://test-trebol.evo.kairosaisolutions.com` |
| Instancia | `el-trebol` |
| Número WhatsApp | `+54 9 11 2380-9397` (`5491123809397@s.whatsapp.net`) |
| Status pre-desconexión | `open` (conectado) |
| API key (test) | `c6b31e8f3edfcd67b670498172ff11cde691e50c2f21a2345d82c1b53bced85c` |
| Bot que consume | `trebol-test-bot` (LangGraph Python) |
| Webhook Chatwoot ID 1 | apuntando al bot Python (`/webhook/chatwoot`) |

---

## Cómo reconectar

### 1. Verificar estado actual de la instancia
```bash
curl -s https://test-trebol.evo.kairosaisolutions.com/instance/fetchInstances \
  -H "apikey: c6b31e8f3edfcd67b670498172ff11cde691e50c2f21a2345d82c1b53bced85c" \
  | python3 -m json.tool
```
Si `connectionStatus` es `close` o similar → seguir paso 2.

### 2. Pedir QR a Evolution
```bash
curl -s https://test-trebol.evo.kairosaisolutions.com/instance/connect/el-trebol \
  -H "apikey: c6b31e8f3edfcd67b670498172ff11cde691e50c2f21a2345d82c1b53bced85c"
```
Devuelve un base64 con el QR. Para ver el QR en navegador, abrir el manager de Evolution:
- `https://test-trebol.evo.kairosaisolutions.com/manager`
- Login con la API key de arriba.
- Buscar la instancia `el-trebol` → botón "Connect" → escanear con WhatsApp del número `+54 9 11 2380-9397`.

### 3. Confirmar conexión
```bash
curl -s https://test-trebol.evo.kairosaisolutions.com/instance/fetchInstances \
  -H "apikey: c6b31e8f3edfcd67b670498172ff11cde691e50c2f21a2345d82c1b53bced85c" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); [print(f\"{i.get('name')} → {i.get('connectionStatus')} ({i.get('ownerJid','')})\") for i in (d if isinstance(d,list) else [d])]"
```
Debe decir `el-trebol → open (5491123809397@s.whatsapp.net)`.

### 4. Smoke test — mandar "holaa" desde tu número personal
Tu número personal de test: `+54 9 11 5063-5028`.
Mandale "holaa" al bot test. Tiene que responder con saludo + pregunta nombre+presupuesto.

### 5. Si no responde — verificar webhook de Chatwoot
El webhook ID 1 de Chatwoot debe seguir apuntando al bot Python (no a n8n):
```bash
docker exec trebol-test-chatwoot-web bundle exec rails runner "puts Webhook.find(1).url"
```
Esperado: `https://test-trebol.bot.kairosaisolutions.com/webhook/chatwoot`

---

## Por qué se desconectó

Querías probar otro agente sobre el mismo número físico de WhatsApp. WhatsApp Multi-Device permite varios "linked devices" pero Evolution ocupa uno; para que el otro agente pueda parearse, hay que liberar el slot.

**Método usado**: ver al final de este doc cuando lo confirmes — pendiente decidir entre A) `DELETE /instance/logout` vía Evolution API o B) unlink manual desde la app de WhatsApp en el celular.

---

## Contexto que estábamos siguiendo (NO PERDER)

Antes de la pausa estábamos trabajando en el **MVP de FangioBot Inventory Sync**. Estado:

- Roadmap real: `Kairos_Brain/proyectos/Fangio_CRM/Next_Session_Checklist.md` (no el `Roadmap_Stock_Ingestion_v1.md` que está obsoleto).
- Pendiente del usuario antes de codear:
  - **A.1**: pegar `FANGIOCRM_MONGODB_URI` en `bot-service/.env` (o en `Kairos_Brain/secrets/inventario.md`).
  - **A.2**: cargar XLSX de prueba en FangioBot (Vercel) y darle Save → confirmar que `tenantinventories` tiene 1 doc, anotar `tenantId`.
  - **A.3** (opcional): anotar columnas que `detectColType` posicionó mal.
- Decisiones del MVP cerradas en §C del checklist (schema MAYÚSCULAS, ada-002, vector_index reuse, sin multi-tenant collections, sin cron de reconciliación todavía).

Una vez reconectado Evolution + listos A.1 y A.2 → arrancar con la estructura `bot-service/trebol_bot/ingest/` descripta en §B.3 del checklist.

---

## Referencias
- [[../proyectos/Fangio_CRM/Next_Session_Checklist]]
- [[../proyectos/Fangio_CRM/Arquitectura_Datos]]
- Memory: `feedback_evo_logout_prohibited.md` (logout prohibido en PROD, test debería estar OK)
- Memory: `reference_evolution_ghost_modes.md` (3 modos de sesión fantasma — Mode C requiere re-scan QR)
