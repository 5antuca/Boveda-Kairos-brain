---
tags: [session-summary, trebol, bot-python, langgraph, fase6, fase7]
fecha: 2026-04-17
status: Fase 6 deployada — Fase 7 lista para rebuild
---

# Session Summary 2026-04-17 — Bot Python Fase 6+7

## Contexto

Sesión centrada en hacer que el bot Python (LangGraph) se comporte igual o mejor que el workflow n8n v4. Punto de partida: bot respondía "¿Con qué presupuesto contás?" al primer mensaje ("holaa"), en lugar del saludo completo con introducción.

---

## Fase 5 — Regresión test_bot.sh (hecha antes)

- Fix NS1 anti-pattern: `claro.*disponible` matcheaba "opciones disponibles" legítimo.
- Resultado final: **23/23 checks pasando**.
- Script: `scripts/test_bot.sh`

---

## Fase 6 — Cutover Chatwoot + Observabilidad

### Cambios deployados (container corriendo)

- **Chatwoot webhook ID 1** apunta al bot Python (`test-trebol.bot.kairosaisolutions.com/webhook/chatwoot`). ID 2 sigue en n8n (`conversation_updated`).
- **Filtro por inbox**: `chatwoot_inbox_id: 2` en `configs/trebol.yaml` — bot ignora mensajes de otros inboxes (ej: MV Autos).
- **Langfuse observabilidad**: trace padre `whatsapp_turn` wrappea todo el turno:
  - `LangGraph` (agent run con LLM calls + tool calls)
  - `response_sent` (preview de lo enviado)
  - `crm_extraction` (datos extraídos + alerta)
  - Buscar en https://us.cloud.langfuse.com por `session_id=trebol:{chat_id}` o `user_id={phone}`
- **Hairpin NAT fix**: contenedores Chatwoot y bot necesitaban `extra_hosts` apuntando dominios `*.kairosaisolutions.com` → `172.18.0.100` (Traefik) para comunicarse entre sí dentro del VPS.
- **History pollution fix**: `save_history=False` en `handle_message()` — historia se guarda en `chatwoot.py` solo si `send_message()` fue exitoso.

### Archivos modificados (Fase 6)

| Archivo | Cambio |
|---|---|
| `bot-service/trebol_bot/observability.py` | Nuevo — singleton Langfuse client |
| `bot-service/trebol_bot/client_config.py` | Nuevo — `chatwoot_inbox_id` field |
| `bot-service/configs/trebol.yaml` | `chatwoot_inbox_id: 2` |
| `bot-service/trebol_bot/webhook/chatwoot.py` | Trace padre Langfuse + filtro inbox + save_history=False |
| `environments/test/trebol/docker-compose.yml` | `extra_hosts` en bot + Chatwoot containers |

---

## Fase 7 — CRM State Injection (PENDIENTE REBUILD)

### Problema raíz

El system prompt `trebol.txt` tenía la expresión n8n `={{ $('Construir Estado CRM')... }}` pasada literalmente al LLM. El LLM interpretaba eso como contenido real del estado, activando ramas incorrectas del CHARLA INICIAL. Además, sin estado CRM persistido entre turnos, el bot olvidaba nombre, presupuesto y vehículo en cada turno.

### Solución implementada

Equivalente Python del nodo n8n "Construir Estado CRM":

1. **`state.py`** (nuevo) — 4 funciones:
   - `load_crm_state(phone, client_id)` — lee `bot:{client_id}:{phone}:crm_state` de Redis (TTL 7d)
   - `save_crm_state(phone, client_id, state)` — persiste estado post-extracción
   - `parse_techo_usd(presupuesto)` — extrae valor numérico del string "U$S 15.000"
   - `build_estado_calificacion(crm_state, dolar_blue)` — formatea estado con ✅/❌ + PRÓXIMO OBJETIVO + [CONTEXTO DE SISTEMA] con tipo de cambio

2. **`graph.py`** — `handle_message()` ahora:
   - Carga `crm_state` de Redis antes de invocar el grafo
   - Fetcha dólar blue via `httpx` (Bluelytics API, timeout 3s, no bloqueante)
   - Construye `estado_calificacion` y lo inyecta en `AgentState`
   - `agent_node()` lo pasa a `load_system_prompt()`

3. **`prompts.py`** — reemplaza `{ESTADO_CALIFICACION}` en runtime

4. **`crm.py`** — después de cada extracción CRM, llama `save_crm_state()` para persistir en Redis

5. **`trebol.txt`** — reemplazada expresión n8n por placeholder `{ESTADO_CALIFICACION}`

### Estado CRM en primer mensaje (sin datos)

```
(sin datos — primer contacto)
PRÓXIMO OBJETIVO: saludar y pedir nombre + presupuesto
[CONTEXTO DE SISTEMA] U$S 1 ≈ $ 1.245 (blue, hoy)
```

### Archivos modificados (Fase 7)

| Archivo | Cambio |
|---|---|
| `bot-service/trebol_bot/agent/state.py` | Nuevo |
| `bot-service/trebol_bot/agent/graph.py` | AgentState + dólar blue + CRM injection |
| `bot-service/trebol_bot/agent/prompts.py` | Acepta estado_calificacion |
| `bot-service/trebol_bot/agent/crm.py` | save_crm_state post-extracción |
| `bot-service/configs/prompts/trebol.txt` | {ESTADO_CALIFICACION} placeholder |

---

## Para activar Fase 7 (rebuild pendiente)

```bash
cd /root/kairos-infrastructure/environments/test/trebol
docker compose build trebol-test-bot --no-cache
docker stop trebol-test-bot && docker rm trebol-test-bot
docker compose up -d --no-deps trebol-test-bot
bash /root/kairos-infrastructure/scripts/clear-chat-memory.sh 5491150635028
bash /root/kairos-infrastructure/scripts/test_bot.sh all
# Test real: enviar "holaa" → debe responder con saludo completo
```

---

## Gaps conocidos (backlog post Fase 7)

| Gap | Descripción |
|---|---|
| Fotos | system prompt retorna `fotos_mensaje1/2/3` arrays — bot los ignora. Implementar envío via Evolution API `/sendImage` |
| Bot-off / handoff hardening | n8n tenía Redis flag + Chatwoot `custom_attributes` para frenar bot post-handoff. No implementado en Python |
| Guardia permuta | n8n tenía state machine que capturaba km/año/estado/fotos secuencialmente. Python bot lo deja al LLM |
| Guardia anticipo | n8n validaba anticipo mínimo antes de simular cuotas. Python bot lo deja al LLM |
