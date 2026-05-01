# Operation Log

## [2026-05-01] rollback | Vuelta al bot del 18-abril como base limpia para FangioCRM
- Tras dos sesiones de testing real (2026-04-30 y 2026-05-01) con principios canónicos v1+v2, el usuario decidió rollbackear al estado del 18-abril (commit `7f1e5c2`, cutover prod LangGraph). Razón: la iteración del Sales Swarm + multi-LLM + principios canónicos había agregado complejidad sin convertir respuestas mejores en testing real con WhatsApp.
- **Branch operativa nueva**: `bot-rollback-2026-04-18` (pusheada a origin). main intacto con WIP preservado en `db9055d` (snapshot pre-rollback).
- **Patches sobre la base del 18-abril**:
  - `5d8f1a7` — `mongo_collection: propiedades-test` (no se revierte el inventario porque la colección `propiedades` quedó rota el 26-04).
  - `0f164cf` — identidad cambia a "Autos Norte" + ubicación ficticia "Av. Maipú 2380, Olivos" + reescritura CHARLA INICIAL para NO pedir presupuesto al inicio (orden estricto: modelo → estado → uso → presupuesto último recurso).
- **Identidad**: este agente pasa a ser explícitamente "el motor de respuestas de FangioCRM". Trebol queda como tenant de test/referencia.
- **Limpieza del roadmap previo**: archivados a `_archivado/` los docs de Sales Swarm, principios canónicos v1/v2, multi-LLM (Groq/Gemini), Token Optimization, OpenAI quota fallback, sesiones 17-abril y 25-abril. También archivado `Fangio_CRM/Bot_LangGraph_Migration.md` (spec multi-tenant basado en el bot v2). Conservados con README explicativo.
- **Doc canónica nueva**: [[proyectos/LangGraph_Bot/Pipeline_Estructura]] — fuente de verdad técnica del agente actual (pipeline end-to-end, state, tools, memoria Redis, estructura archivos, comandos). Reescrita [[proyectos/LangGraph_Bot/LangGraph_Bot]] como índice del proyecto.
- **Próximo paso**: usuario va a definir roadmap de mejoras desde este punto.

## [2026-05-01] sesion | Iteración de principios v2 — emojis incentivados + invitación a venir + cierre comercial activo
- Tras dos sesiones de testing real con WhatsApp (2026-04-30 y 2026-05-01), el usuario detectó que el bot sonaba a "robot de soporte" y no a vendedor de salón.
- Aplicando la meta-regla del canónico ("modificar = reformular íntegro"), se reformularon **P4** (tono espejo + emojis humanizadores) y **P5** (cierre con 3 modos en vez de 2).
- Modo **5.B "Invitación a venir"** nuevo: empuje al físico (visita a la agencia) cuando hay interés concreto en UN auto sin cierre fuerte. Llena el gap entre puerta abierta (5.A) y handoff con frase canónica (5.C).
- Reglas nuevas: P2 extendido para fotos no cargadas → derivación parcial cálida ("ya le pido a los chicos que te las saquen 📸"); CASOS ESPECIALES nuevo "PRESUPUESTO DADO" para que el bot haga la cuenta inmediatamente y no repregunte.
- Guard determinístico anti re-saludo agregado en `bot-service/trebol_bot/agent/graph.py` post-LLM: si NO es primer turno y el LLM saluda igual ("Hola, hablás con Santi..."), strip por código.
- También se aplicó en sesión previa el mismo día: filtro de segmento determinístico en `tools.py` (Corolla → urbano, Hilux → pickup) con reorder + nota interna al LLM cuando todos los resultados son cross-segmento, y `_ensure_question_last` en `_parse_agent_response` para que la pregunta quede al final.
- Doc nuevo: [[proyectos/LangGraph_Bot/Bot_Principios_Iteracion_2026-05-01]]. Banner agregado al canónico v1 ([[proyectos/LangGraph_Bot/Bot_Principios_Canonicos]]) apuntando a la iteración. **No se sobreescribió el v1** — queda como referencia histórica.
- Pendientes (open questions del doc): few-shot examples para anclar 5.B, eval suite con escenarios nuevos, alerta admin automática cuando bot promete fotos no cargadas.

## [2026-04-27] sesion | Decisión metodológica — del prompt-engineering reactivo al diseño por capas
- Después de 8+ iteraciones de prompt en una sola sesión (saludo recíproco, max 2-3 fichas, filtro semántico, default "no hay", detector handoff canónico, etc.) se confirmó el techo del enfoque reactivo: cada caso edge nuevo agrega micro-reglas que se chocan entre sí.
- Cambio de metodología documentado en [[proyectos/LangGraph_Bot/Bot_Behavior_Methodology]]: 4 capas (principios + prompt limpio + few-shot + eval suite).
- Fase 1 (definir 5 principios firmes con el usuario) iniciada al final de la sesión. Bloquea nuevas iteraciones de prompt hasta tener principios + reescritura.
- Aplica también al diseño multi-tenant de FangioCRM (los principios son globales, los few-shot pueden ser per-tenant).
- Banner agregado a [[infra/Roadmap]] al tope.

## [2026-04-27] sesion | F3 Specialists deployed + Decisión bot LangGraph como motor FangioCRM
- F3 Sales Swarm deployado en test: 3 archivos `personas/explorador.md|work_machine.md|passion_drive.md` con tono, argumentos, ejemplos few-shot y frase de derivación específica por perfil. Refactor `profiler.render_psicoperfil_block()` para leer del archivo correspondiente. Smoke test: WORK_MACHINE responde con cold open profesional + TCO; PASSION_DRIVE con energía + urgencia. Diferencias visibles entre perfiles.
- Fixes UX previos a F3 (mismo día): trim de fillers ("Perfecto." / "Listo." colgados), saludo recíproco no invasivo, max 2-3 fichas + cualificación, separación frase canónica handoff cierre vs derivación parcial (no fotos).
- Decisión arquitectónica: el bot LangGraph (`trebol-test-bot`) pasa a ser el motor cognitivo de FangioCRM en vez de n8n LangChain. Reemplazo del cerebro AI Agent en el plano `Arquitectura_SaaS_Multitenant`. Spec creada en [[proyectos/Fangio_CRM/Bot_LangGraph_Migration]] con 6 fases (config dinámica, webhook Evolution directo, prompt template, tools por tenant, UI editor, F4 Closer per-tenant). Implementación pendiente — el usuario quiso seguir testeando F3 con Trebol antes de migrar.
- WhatsApp sale temporalmente del bot: el usuario movió el phone (5491123809397) a la instance `el-trebol` de FangioCRM (status `open`). La instance `eltrebollll` que usaba el bot quedó en `close` (device_removed conflict). Para retomar tests del bot Trebol → re-conectar `eltrebollll` desde Evolution Manager UI.

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
