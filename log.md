# Operation Log

## [2026-04-26] ops | Apagado total de Trebol PROD — cliente en pausa indefinida
- **Motivo**: El Trébol Automotores se dio de baja como cliente. Posibilidad futura de reactivación → no se elimina nada, solo se apaga.
- **Acción**: `docker stop` en orden de dependencia de los 9 containers `trebol-prod-*`:
  - `trebol-prod-bot` (LangGraph Python)
  - `trebol-prod-n8n` + `trebol-prod-n8n-worker` (corta CRM Sheets writes + alertas vendedores)
  - `trebol-prod-chatwoot-sidekiq` (Exit 137 / SIGKILL tras timeout — esperado)
  - `trebol-prod-evolution-api` (sesión Baileys preservada en volumen, sin `DELETE /instance/logout`)
  - `trebol-prod-chatwoot-web`
  - `trebol-prod-pgbouncer`
  - `trebol-prod-redis`
  - `trebol-prod-postgres`
- **Lo que NO se tocó**: volúmenes Docker (sesión Evolution, dumps Postgres/Redis, datos Chatwoot), workflows n8n, inbox/webhook config Chatwoot, Sheets prod, DNS, Traefik routes, `.env` de prod.
- **Side effects esperados**:
  - Mensajes de WhatsApp entrantes no se procesan; el cliente final ve la cuenta como "última conexión hace X días".
  - Riesgo conocido (`reference_evolution_ghost_modes.md`): tras tiempo prolongado offline, Evolution puede caer en "ghost mode C" al reactivar y exigir QR re-scan manual.
- **Reactivación**: `cd environments/production/trebol && docker compose up -d` levanta todo en el mismo estado. Validar conexión Evolution (`GET /instance/connectionState`) antes de declarar el bot operativo.
- **Verificar al reactivar**: prod `.env` no tiene `LLM_PROVIDER` definido — el factory cae al default `groq` pero no hay `GROQ_API_KEY` en prod. Probable que el bot esté roto o usando OpenAI vía algún path implícito. Antes de exponer el bot a tráfico real, definir `LLM_PROVIDER=openai` en `environments/production/trebol/.env` (reusar el patrón aplicado en test el 2026-04-26).

## [2026-04-26] sesion | Supreme Sales Swarm F1 + LLM migration + Token optimization
- Diseño e implementación de Sales Swarm Fase 1: Profiler psicográfico (3 perfiles: EXPLORADOR/WORK_MACHINE/PASSION_DRIVE).
- Migración del provider cognitivo: OpenAI (key cliente) → Gemini → **Groq** (Llama 3.3 70B free 14.4k RPD).
- Optimización agresiva de tokens: ~30K → ~12-15K por turno (-50%+).
- Bug hunting con tráfico WhatsApp real: saludo no se inyectaba (fix), techo USD ignorado (fix determinístico), bot ofrecía motos como autos (colección MongoDB rota + filtro por TIPO).
- Ajustes en `bot-service/`: nuevo factory `llm.py`, `agent/profiler.py`, prompt comprimido 8K→3.5K, `_dedupe_repeated_text` para fix DESC corrupto, CRM extractor guard.
- Frase canónica handoff acordada con usuario (rioplatense, sin nombre propio, variante por horario).
- Páginas creadas: [[proyectos/LangGraph_Bot/Supreme_Sales_Swarm]], [[proyectos/LangGraph_Bot/LLM_Providers]], [[proyectos/LangGraph_Bot/Token_Optimization]], [[proyectos/LangGraph_Bot/Sesion_2026-04-25_Sales_Swarm_y_LLM_Migration]].
- Páginas actualizadas: [[proyectos/LangGraph_Bot/LangGraph_Bot]] (Fase 11), [[proyectos/Trebol/SheetsToMongo_RAG_Inventario]] (estado colecciones + bug DESC), [[index]].
- Spec fuente: `specs/2026-04-25-supreme-sales-swarm.md`.

## [2026-04-25] ingest | Roadmap VPS Legacy
- Procesado archivo `raw/roadmap_vps_legacy.md`.
- Extraída historia de refactorización Trebol v3/v4.
- Actualizados `infra/Roadmap.md` y `proyectos/Trebol_Bot.md`.
