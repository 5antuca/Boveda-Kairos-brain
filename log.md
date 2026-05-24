# Operation Log

## [2026-05-24] build | FangioCRM SaaS MVP (cont.) — F2 auto-schema + F4 prompt caching + billing Shopify
Continuación de la misma sesión. Se completó el **backend autónomo** del MVP.

- **F2.1/F2.2 — auto-schema "de fábrica"**: `ingest/schema_mapping.py` (mapper LLM Excel→canónico que desambigua por valores, ej. "Año Modelo"→ANIO) + wired en el ingest con `columnMapping` persistido en `tenantinventories`. Verificado: el-trebol real, planilla sucia, planilla sin precio (genera pregunta del agente); dry-run reimport → 0 cambios (cero regresión). Commits `9e3cf0b`+`c917793`.
- **F4 — prompt caching**: el estado CRM del turno se pasa como mensaje aparte → el prompt estático (~5k tok) queda como prefijo estable → **~98% de prompt_tokens cacheados** por OpenAI (antes ~25%). Commit `e5d81d0`.
- **Billing = Shopify** (decisión del usuario; descartado MercadoPago directo por fees + recurrente incierto en AR — queda como plan B). Verificado que el webhook `api/webhooks/shopify` está vivo y el `SHOPIFY_WEBHOOK_SECRET` ya está en Vercel. Regla: **registro obligatorio antes de pagar** (match por email). Falta: confirmar el lado Shopify (producto/pago/topic) + endurecer webhook (baja→pausar) + gate de pago.
- Docs: [[proyectos/Fangio_CRM/Roadmap_SaaS_MVP]] (vivo), [[proyectos/Fangio_CRM/Roadmap_Proxima_Sesion]] (empezar acá), spec `specs/2026-05-24-fangiocrm-saas-mvp.md`. Todo commiteado en `bot-rollback-2026-04-18` (pusheado a GitHub).
- Próximo: F3 (Shopify — confirmar tienda + endurecer webhook), F2.3 (UI onboarding), F4 metering, F5/F6.

## [2026-05-24] build | FangioCRM SaaS MVP — F0 auditoría + F1 bot multi-tenant + fix presupuesto
Sesión con santi para arrancar el MVP de FangioCRM como **SaaS alquilable** (50k ARS/mes vía MercadoPago, público no-técnico, Excel-drop con auto-schema). Se escribió spec/roadmap, se auditó el scaffold (F0) y se completó F1 (bot multi-tenant), todo en test sobre `bot-rollback-2026-04-18`.

- **F0** (auditoría): el scaffold ya tenía onboarding (`register`/`setup`), **zero-touch Evolution** por tenant, QR con self-heal, loop inbound (texto/audio→Whisper/imagen→Vision) y persistencia. Mock: el checkout (sin MercadoPago real).
- **F1** (deployado a test, regresión 25-26/27): config del bot resuelta desde `Tenant` en Mongo (`fangio_crm.tenants`, fallback YAML), prompt parametrizado por tenant (template + `{NOMBRE_AGENCIA}`/etc.), stock aislado por `tenantId` en colección + `vector_index` compartidos. Aislamiento verificado.
- También fix de la pregunta de presupuesto: el bot inventaba el monto del precio de un auto; ahora ante señal sin número pregunta presupuesto+uso. Commits `kairos-infrastructure@a89804a` + `@89eb35b`.
- Decisiones: WhatsApp = Evolution por tenant; stock = colección compartida + filtro tenantId; billing = MercadoPago suscripciones (F3); prompt caching obligatorio.
- Docs: [[proyectos/Fangio_CRM/Roadmap_SaaS_MVP]] · spec `specs/2026-05-24-fangiocrm-saas-mvp.md` · update en [[proyectos/Fangio_CRM/Fangio_CRM]].
- Próximo: **F2** — auto-schema "de fábrica" (Excel→canónico) + agente de onboarding.

## [2026-05-04] design | Roadmap Stock Ingestion v1 + Trebol Bot Embedded en FangioCRM
Diseño aprobado por santi para que cada concesionaria (tenant) suba su XLSX de inventario a FangioCRM, lo mapee a un schema canónico y se sincronice incremental a su colección Mongo privada con embeddings. En paralelo, Trebol Bot (Python LangGraph) absorbe el rol de motor de respuestas WhatsApp para todos los tenants — cada tenant configura nombre/vendedor/tono/financiación desde la UI. Reemplaza gradualmente el FangioBot v2 (n8n).

- Decisiones cerradas: A) bot embebido, B) colección por tenant, C) diff incremental tipo SheetsToMongo con fingerprint hash determinístico (sin AppScript), D) sin Paperclip.
- Decisiones abiertas (D1-D6 en el roadmap): runtime workers, Redis aislado, persistencia XLSX, dolar referencia, formatos extra.
- Sprints planificados: 0-7 (fundaciones → ingesta → bot multi-tenant → cutover Trébol → onboarding 2do tenant).
- Docs: [[proyectos/Fangio_CRM/Roadmap_Stock_Ingestion_v1]] · [[proyectos/Fangio_CRM/Trebol_Bot_Embedded]] · update en [[proyectos/Fangio_CRM/Fangio_CRM]] e [[index]].

## [2026-05-01] fix | 4 bugs detectados en testing real con WhatsApp + audio
Sesión de testing real con audio (cliente + bot) detectó 4 bugs concretos. Todos corregidos en branch `bot-rollback-2026-04-18` (commit pending).

**Bug 1 — En audio mode el bot describía la camioneta en vez de mandarle la foto.**
- Síntoma: cliente dice por audio "pasame fotos de la 3, estoy manejando" → bot responde con audio narrando la ficha + `image_urls_count: 0`. Los attachments nunca se enviaban.
- Causa: la nota "MODO AUDIO ACTIVO" inyectada en `agent/graph.py` decía literal *"NADA de URLs"* y *"máximo 2-3 frases en TOTAL"*. El LLM lo interpretaba como "no poblar `fotos_mensajeN`" y se saltaba la tool de fotos. El dispatcher en `chatwoot.py:301-305` ya enviaba imágenes en audio mode — el problema era 100% upstream.
- Fix: rewrite de la nota separando explícitamente reglas del **texto hablado** (mensaje1/2/3 sin URLs ni precios numéricos) de reglas de **fotos** (`fotos_mensajeN` se siguen poblando con tool igual que en modo texto, las imágenes se mandan como attachment después del audio). Ahora el audio NO reemplaza la foto — la complementa narrando precio contado, anticipo, km, año, versión, motor.
- Archivo: `agent/graph.py:411-437`.

**Bug 2 — Saludo determinístico con nombre viejo "El Trébol Automotores".**
- Síntoma: tras la rename a Autos Norte (commit `0f164cf`), en algunos turnos el bot saludaba *"Hablás con Santi de El Trébol Automotores"*. Pasaba cuando el LLM arrancaba con algo distinto a "Hola/Buenas/etc." (ej: "¡Buenísimo!" después de hacer match en inventario).
- Causa: `graph.py:576` tenía hardcodeado el texto canónico del saludo enforcement. La rename actualizó el prompt y el `trebol.yaml` (`nombre_agencia: Autos Norte`) pero no este fallback. Mismo hardcode en `chatwoot.py:457` (handoff de audio fallido) y `crm.py:61` (prompt de extracción).
- Fix: leer dinámicamente `client_cfg.nombre_agencia` en los 3 puntos. Sacado el hardcode literal del prompt de extracción CRM ("Santi, asesor de la agencia"). Así no se vuelve a romper la próxima vez que se rename.
- Archivos: `agent/graph.py:575-581`, `webhook/chatwoot.py:456`, `agent/crm.py:61`.

**Bug 3 — Bot saltaba a financiación sin mostrar el auto cuando el request era OPEN-ENDED.**
- Síntoma: cliente dice por audio *"ando buscando algún Mercedes viejo, algún deportivo, tengo 15k"* → bot responde *"¡Buenísimo! Con U$S 15.000 de anticipo podés financiar el Mercedes Benz 220/D 1971..."* + opciones de financiación. NO mostró ficha ni preguntó interés.
- Causa: el prompt tenía bloque "VEHÍCULO ESPECÍFICO + PRESUPUESTO — 3 CASOS" que aplica fórmula textual fija (`"¡Buenísimo! Con U$S X de anticipo podés sacar el [vehículo] financiado..."`) cuando el cliente menciona un monto y hay match en inventario. Pero NO distinguía entre request **específico** (marca+modelo concretos, link de ML, "el N°2") vs **open-ended** (indefinido — "algún X", solo TIPO sin marca). Si la tool devolvía un único Mercedes con "Mercedes" como query, el LLM lo trataba como si el cliente hubiera elegido ese auto puntualmente.
- Fix: regla nueva ANTES de los CASOS 1/2/3 con definición de open-ended vs específico, prohibición explícita de aplicar CASOS aunque haya un único match si el request fue open-ended, y ejemplo concreto del caso real.
- Archivo: `configs/prompts/trebol.txt` antes del bloque "VEHÍCULO ESPECÍFICO + PRESUPUESTO".

**Bug 4 — Bot disparaba "no tenemos fotos" sin que el cliente haya pedido fotos.**
- Síntoma: cliente dice *"ando buscando algún auto de los 90/2000, tengo 20k, busco un Mercedes o algo parecido con lindos interiores, ¿tienen stock?"* → bot responde *"No tenemos fotos cargadas del Mercedes Benz 220/D 1971, ya le aviso a administración para que te las envíe"*. Saltó el ficha entero y disparó la frase canónica de handoff por foto faltante.
- Causa: el prompt tenía la regla *"FOTOS_DISPONIBLES: no → responder 'No tenemos fotos cargadas...'"* sin precondición explícita de que el cliente hubiera pedido fotos. Apenas la tool devolvía `FOTOS_DISPONIBLES: no`, el LLM disparaba la frase reflexivamente.
- Fix: precondición obligatoria explícita ("SOLO si el cliente PIDIÓ fotos en turno actual o anterior"). Si no pidió fotos → ignorar el campo y mostrar la ficha normal. Ejemplo negativo y positivo agregados.
- Archivo: `configs/prompts/trebol.txt` debajo de la regla `FOTOS_DISPONIBLES: no`.

**Estado**: bot rebuildeado + restarteado, healthy. Memoria `5491150635028` limpia. Validación end-to-end en WhatsApp pendiente del usuario.

## [2026-05-01] feature | Vision Classifier — clasificación de imágenes WhatsApp (gpt-4.1-mini)
- Cuando el cliente adjunta una o más imágenes, ahora un LLM multimodal (`gpt-4.1-mini`, una sola call con todas las URLs) describe lo que ve (marca/modelo/año, source `screenshot|raw_photo|otro`, descripcion corta). El output se inyecta como marker rico al `content` del agent principal — antes era solo `[cliente envió N fotos]` sin contexto.
- **Decisión clave**: el vision LLM **NO infiere intención** (compra vs venta/permuta). Solo describe la imagen. La intención la decide el agent principal con todo el contexto de conversación (texto del cliente + historial + descripción visual). Esto evita inconsistencias entre lo que dice el clasificador y lo que el agent ya sabe del turno anterior.
- **Archivos nuevos**: `bot-service/trebol_bot/integrations/vision_classifier.py` (`classify_images()` + `build_vision_marker()`).
- **Archivos modificados**: `bot-service/trebol_bot/webhook/chatwoot.py` (recolecta `data_url`s en el loop de attachments + llama vision + inyecta marker; si falla → handoff directo a admin con mensaje fijo + bot_off + alerta `lead_caliente`); `bot-service/configs/prompts/trebol.txt` (nueva sección `[FOTOS RECIBIDAS DEL CLIENTE]` con 5 reglas de interpretación; default cuando no hay texto + raw_photo + contexto poco claro → preguntar *"¿Este es un auto que querés vender o uno que viste y te interesa?"*).
- **Fallback ante error de OpenAI Vision**: handoff directo a admin con frase fija *"Recibimos las fotos, ya las ve administración..."* + `set_bot_off(reason="vision_classifier_failed")` + alerta `lead_caliente`. Decisión consciente: preferimos derivar a admin que dejar al agent improvisar.
- **Alerta `tipo_alerta=foto`**: se mantiene igual (con dedup Redis 30min). El vision no la condiciona — vendedor recibe alerta aunque la imagen sea un DNI o un meme.
- **Modelo**: `gpt-4.1-mini` con `detail=low`, `temperature=0`, `response_format=json_object`. No agrega env vars nuevas — reusa `OPENAI_API_KEY`.
- Container `trebol-test-bot` rebuild + healthy. Regresión `test_bot.sh all` pasa 22-23/23 (T3 flaky por phrasing del LLM, no determinístico, ya existía antes del cambio).
- Página canónica nueva: [[proyectos/Fangio_CRM/LangGraph_Bot/Vision_Classifier]]. Pipeline_Estructura §8 actualizado para reflejar el nuevo pre-procesamiento de fotos.
- **Validación end-to-end pendiente del usuario**: 5 casos manuales con WhatsApp real (screenshot ML + texto compra; foto cruda sin texto; foto + texto permuta; imagen no-vehículo; forzar fallo de vision).

## [2026-05-01] feature | Audio Mode (ElevenLabs TTS) — feature básica funcional, bugs documentados
- Integración ElevenLabs TTS para que el bot responda con audio cuando el cliente dice que no puede leer/escribir (manejando, en moto, caminando, etc.).
- Archivos nuevos: `bot-service/trebol_bot/integrations/tts_elevenlabs.py`, `bot-service/trebol_bot/memory/audio_mode.py`. Modificados: `config.py`, `chatwoot_client.py` (+`send_audio_bytes`), `webhook/chatwoot.py` (regex triggers + ramificación pre-send), `agent/graph.py` (inyección nota MODO AUDIO al prompt), `docker-compose.yml` (3 env vars), `.env.example`.
- Decisiones: trigger SOLO por frase explícita del cliente (no por mandar audio); desactivación SOLO por frase OFF o TTL natural 15min (no por mensaje largo); audio único por turno; fallback silencioso a texto si TTS falla.
- **Bug bloqueante pendiente**: el LLM responde con formato lista/ficha en modo audio, lo que hace que TTS lea "U dólar S" en vez de "dólares" y separadores `|` literalmente. Documentado en [[proyectos/Fangio_CRM/LangGraph_Bot/Audio_Mode_Roadmap]] con 4 opciones de fix y recomendación (Opción B normalizador determinístico + Opción A refuerzo de prompt).
- Otro pendiente: la voice_id elegida (`MjtZn5tagxL1RO6w9ER5`) come palabras en español. Probar Antoni (`ErXwobaYiN019PkySvjV`) o upgrade a plan Starter ($5) para acceso a voice library.
- Status: feature funciona end-to-end pero calidad de audio aún no es production-ready. Commit del feature pendiente — sigue como WIP en branch `bot-rollback-2026-04-18`.

## [2026-05-01] rollback | Vuelta al bot del 18-abril como base limpia para FangioCRM
- Tras dos sesiones de testing real (2026-04-30 y 2026-05-01) con principios canónicos v1+v2, el usuario decidió rollbackear al estado del 18-abril (commit `7f1e5c2`, cutover prod LangGraph). Razón: la iteración del Sales Swarm + multi-LLM + principios canónicos había agregado complejidad sin convertir respuestas mejores en testing real con WhatsApp.
- **Branch operativa nueva**: `bot-rollback-2026-04-18` (pusheada a origin). main intacto con WIP preservado en `db9055d` (snapshot pre-rollback).
- **Patches sobre la base del 18-abril**:
  - `5d8f1a7` — `mongo_collection: propiedades-test` (no se revierte el inventario porque la colección `propiedades` quedó rota el 26-04).
  - `0f164cf` — identidad cambia a "Autos Norte" + ubicación ficticia "Av. Maipú 2380, Olivos" + reescritura CHARLA INICIAL para NO pedir presupuesto al inicio (orden estricto: modelo → estado → uso → presupuesto último recurso).
- **Identidad**: este agente pasa a ser explícitamente "el motor de respuestas de FangioCRM". Trebol queda como tenant de test/referencia.
- **Limpieza del roadmap previo**: archivados a `_archivado/` los docs de Sales Swarm, principios canónicos v1/v2, multi-LLM (Groq/Gemini), Token Optimization, OpenAI quota fallback, sesiones 17-abril y 25-abril. También archivado `Fangio_CRM/Bot_LangGraph_Migration.md` (spec multi-tenant basado en el bot v2). Conservados con README explicativo.
- **Doc canónica nueva**: [[proyectos/Fangio_CRM/LangGraph_Bot/Pipeline_Estructura]] — fuente de verdad técnica del agente actual (pipeline end-to-end, state, tools, memoria Redis, estructura archivos, comandos). Reescrita [[proyectos/Fangio_CRM/LangGraph_Bot/LangGraph_Bot]] como índice del proyecto.
- **Próximo paso**: usuario va a definir roadmap de mejoras desde este punto.

## [2026-05-01] sesion | Iteración de principios v2 — emojis incentivados + invitación a venir + cierre comercial activo
- Tras dos sesiones de testing real con WhatsApp (2026-04-30 y 2026-05-01), el usuario detectó que el bot sonaba a "robot de soporte" y no a vendedor de salón.
- Aplicando la meta-regla del canónico ("modificar = reformular íntegro"), se reformularon **P4** (tono espejo + emojis humanizadores) y **P5** (cierre con 3 modos en vez de 2).
- Modo **5.B "Invitación a venir"** nuevo: empuje al físico (visita a la agencia) cuando hay interés concreto en UN auto sin cierre fuerte. Llena el gap entre puerta abierta (5.A) y handoff con frase canónica (5.C).
- Reglas nuevas: P2 extendido para fotos no cargadas → derivación parcial cálida ("ya le pido a los chicos que te las saquen 📸"); CASOS ESPECIALES nuevo "PRESUPUESTO DADO" para que el bot haga la cuenta inmediatamente y no repregunte.
- Guard determinístico anti re-saludo agregado en `bot-service/trebol_bot/agent/graph.py` post-LLM: si NO es primer turno y el LLM saluda igual ("Hola, hablás con Santi..."), strip por código.
- También se aplicó en sesión previa el mismo día: filtro de segmento determinístico en `tools.py` (Corolla → urbano, Hilux → pickup) con reorder + nota interna al LLM cuando todos los resultados son cross-segmento, y `_ensure_question_last` en `_parse_agent_response` para que la pregunta quede al final.
- Doc nuevo: [[proyectos/Fangio_CRM/LangGraph_Bot/Bot_Principios_Iteracion_2026-05-01]]. Banner agregado al canónico v1 ([[proyectos/Fangio_CRM/LangGraph_Bot/Bot_Principios_Canonicos]]) apuntando a la iteración. **No se sobreescribió el v1** — queda como referencia histórica.
- Pendientes (open questions del doc): few-shot examples para anclar 5.B, eval suite con escenarios nuevos, alerta admin automática cuando bot promete fotos no cargadas.

## [2026-04-27] sesion | Decisión metodológica — del prompt-engineering reactivo al diseño por capas
- Después de 8+ iteraciones de prompt en una sola sesión (saludo recíproco, max 2-3 fichas, filtro semántico, default "no hay", detector handoff canónico, etc.) se confirmó el techo del enfoque reactivo: cada caso edge nuevo agrega micro-reglas que se chocan entre sí.
- Cambio de metodología documentado en [[proyectos/Fangio_CRM/LangGraph_Bot/Bot_Behavior_Methodology]]: 4 capas (principios + prompt limpio + few-shot + eval suite).
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
- Páginas creadas: [[proyectos/Fangio_CRM/LangGraph_Bot/Supreme_Sales_Swarm]], [[proyectos/Fangio_CRM/LangGraph_Bot/LLM_Providers]], [[proyectos/Fangio_CRM/LangGraph_Bot/Token_Optimization]], [[proyectos/Fangio_CRM/LangGraph_Bot/Sesion_2026-04-25_Sales_Swarm_y_LLM_Migration]].
- Páginas actualizadas: [[proyectos/Fangio_CRM/LangGraph_Bot/LangGraph_Bot]] (Fase 11), [[proyectos/Trebol/SheetsToMongo_RAG_Inventario]] (estado colecciones + bug DESC), [[index]].
- Spec fuente: `specs/2026-04-25-supreme-sales-swarm.md`.

## [2026-04-25] ingest | Roadmap VPS Legacy
- Procesado archivo `raw/roadmap_vps_legacy.md`.
- Extraída historia de refactorización Trebol v3/v4.
- Actualizados `infra/Roadmap.md` y `proyectos/Trebol_Bot.md`.
