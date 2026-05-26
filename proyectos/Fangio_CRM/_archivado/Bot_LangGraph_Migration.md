---
tags: [proyecto, fangiocrm, langgraph, bot, multitenant]
fecha_inicio: 2026-04-27
estado: Spec — sin implementar
prioridad: alta (post Sales Swarm F4)
---

# Migración del cerebro FangioBot: n8n LangChain → LangGraph (Python)

## Contexto

El doc [[Arquitectura_SaaS_Multitenant]] diseñó la arquitectura SaaS de FangioBot con **n8n LangChain como AI Agent**: cuando llega un mensaje WhatsApp por Evolution → fangiocrm-n8n-master fetch a `fangiobot.com/api/agent/context?instance={X}` → AI Agent (LangChain en n8n) contesta.

El 2026-04-27 el usuario pidió cambiar el cerebro: en vez de LangChain en n8n, usar el **bot Python LangGraph** (mismo motor que `trebol-test-bot`). Razón: ya está construido, tiene observabilidad Langfuse, manejo de debounce/CRM state, multi-modalidad y el Sales Swarm (Profiler + Specialists). Mantener un segundo cerebro en n8n duplica esfuerzo y diverge.

n8n queda solo para tooling (CRM writes, alertas, side effects) — patrón idéntico al que usa Trebol hoy.

## Visión final

Cada tenant de FangioBot tiene **su propio agente LangGraph** parametrizado dinámicamente desde `fangiobot.com`. La concesionaria Trébol Automotores pasa a ser un tenant más (instance `el-trebol`) — los `configs/trebol.yaml` quedan como fallback.

El cliente final del SaaS personaliza el bot desde la UI de FangioBot:
- Info de la empresa (nombre, dirección, horarios, redes, ubicación)
- Tono base (formal / informal / cómplice)
- Argumentos propios (qué destacar, qué evitar)
- Tasas de financiación / inventario
- (Eventual) modelo LLM y key del proveedor

## Plan en fases

### Fase 0 — Spec definitiva (15 min)
Documento operacional con shape exacta del JSON que `/api/agent/context` devuelve, contrato de la API, error handling, fallbacks.

### Fase 1 — Tenant config dinámica (~3 hs)
- Bot deja de leer `configs/{client_id}.yaml` y empieza a fetchear `https://fangiobot.com/api/agent/context?instance={X}` en runtime.
- Cache en Redis con TTL ~5 min para no martillar al endpoint.
- Estructura `TenantConfig` Pydantic en `bot-service/trebol_bot/tenant_config.py`.
- Fallback: si el endpoint falla → usar `configs/{instance}.yaml` si existe; si no → 503 al sender.

### Fase 2 — Webhook Evolution directo (~3 hs)
- Bot expone `POST /webhook/evolution` con auth via `EVOLUTION_WEBHOOK_SECRET`.
- Parser de payload Evolution (formato distinto al de Chatwoot — `messages.upsert`, `data.key.remoteJid`, `data.message.conversation`, etc.).
- Identificar `instance` → `tenant_config` → invocar LangGraph.
- Reply via `POST .../message/sendText/{instance}` con la respuesta del agente.
- Bypass total de Chatwoot para FangioBot tenants (Chatwoot solo lo usa Trebol legacy).

### Fase 3 — Prompt customizable por tenant (~2 hs)
- `configs/prompts/{client_id}.txt` deja de ser archivo fijo. Se vuelve **template Jinja-style** con slots:
  - `{NOMBRE_AGENCIA}`, `{DIRECCION}`, `{HORARIOS}`, `{REDES}`
  - `{TONO_OVERRIDE}` (texto libre del tenant)
  - `{ARGUMENTOS_PROPIOS}` (qué destacar)
  - `{PALABRAS_PROHIBIDAS}` (lista)
- Las personas (EXPLORADOR/WORK_MACHINE/PASSION_DRIVE) siguen como overlays globales en `configs/prompts/personas/*.md`. El tenant puede sobrescribir cualquiera vía su config.
- Loader nuevo `prompts.py::load_system_prompt(tenant_config, persona, estado_calificacion)`.

### Fase 4 — Tools por tenant (~2 hs)
- Cada concesionaria: su propia colección MongoDB de inventario, su propio Sheets de CRM, sus propias tasas.
- Tools (`buscar_inventario_autos`, `calcular_cuotas`, `opciones_financiacion`) reciben `tenant_config` por param o ContextVar.
- Sheets ID y MongoDB collection vienen del config dinámico, no del yaml.

### Fase 5 — UI de personalización (FangioBot frontend, fuera de este repo)
- Sección "Configurar Bot" en el dashboard del tenant en `fangiobot.com`.
- Inputs para tono, prompt extra, palabras prohibidas, info de empresa, modelo LLM.
- Save → MongoDB → next message del tenant usa la config nueva (cache invalidado o TTL natural).

### Fase 6 — Sales Swarm F4 (Closer + Dossier) per-tenant
- Posterga hasta que la base multi-tenant esté lista.
- Frase canónica handoff configurable por tenant (algunos prefieren "Te paso con el equipo de ventas..." en vez de "Listo, ya le pasé...").
- Dossier se entrega al canal admin del tenant (grupo WhatsApp configurado en su config).

## Open questions (a confirmar antes de Fase 0)

1. **¿`/api/agent/context` ya está implementado?** El doc lo describe pero hay que verificar contra el código de FangioBot (`/root/apps/FangioCRM/backend/`).
2. **URL real del endpoint** (prod `fangiobot.com` o staging?).
3. **¿El cliente final puede elegir modelo LLM y cargar SU API key**, o el operador (Santiago) lo controla? Cambia arquitectura de provider/cost.
4. **Multi-modal (audio Whisper, fotos)**: ¿lo manejamos por tenant o es feature global?
5. **Quién provisiona la instance Evolution** cuando llega un tenant nuevo: ya está automático según `Fangio_CRM.md` ("aprovisionamiento automático en segundo plano"). Verificar si crea webhook hacia el bot o sigue hacia n8n.

## Migración Trebol

- Trebol pasa a ser tenant `el-trebol` (instance ya existe en Evolution con status `open`).
- `configs/trebol.yaml` queda como fallback hardcoded para no perder el bot Trebol mientras se construye la base multi-tenant.
- Sales Swarm F1+F2+F3 (Profiler + Specialists con archivos de personas) se mantiene 100% — solo se porta de yaml a config dinámica.
- Trebol prod sigue apagado desde 2026-04-26 (cliente de baja). Si vuelven, reactivamos como tenant FangioBot, no como stack standalone.

## Links

- [[Arquitectura_SaaS_Multitenant]] — diseño SaaS original
- [[FangioBot]] — visión general
- [[../LangGraph_Bot/LangGraph_Bot]] — el bot que vamos a portar
- [[../LangGraph_Bot/Supreme_Sales_Swarm]] — F1/F3 ya hechos, F4 espera
