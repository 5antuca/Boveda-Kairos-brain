# Kairos Infrastructure — Claude Context

Sistema multiagente de automatización para agencias digitales corriendo en VPS Linux con Docker.
1 cliente activo (El Trébol Automotores) con bot WhatsApp en producción. Foco actual: optimizar bot Trebol v4 en test.

## Visión — Claude Code como Builder y LangGraph como Orquestador
Objetivo a futuro: usar Claude Code como tu **Swarm Architect (Builder)** para construir un plano de control de agentes especializados en **LangGraph (Python)**. Multi-company con aislamiento de datos, audit log, budgets por agente, approval flows humanos. Obsidian es la fuente de verdad (Vault); los agentes leen de allí y consultan bases como MongoDB Atlas o Qdrant directo.

### Roadmap Swarm Architecture (NO ejecutar sin confirmación)
0. Actualizar docs con la visión de LangGraph como motor de producción ← HECHO
1. LangGraph en test — Entorno Python, contenedor Docker, endpoints FastAPI / webhooks.
2. Primer enjambre: El Trébol — Ruteador inteligente en LangGraph, nodos n8n como herramientas de I/O puro, bots de WhatsApp delegando cognitivamente a LangGraph.
3. Approval flows — Human-in-the-loop nativo en LangGraph para tickets y derivaciones.
4. Segundo cliente — Onboarding parametrizado, validar aislamiento en LangGraph.
5. Nuevos canales — Instagram bot ruteado por el mismo enjambre cognitivo.

## Cómo trabajar en este proyecto
1. **Revisá lo que existe antes de proponer.** No asumas la estructura — explorá archivos y preguntá si algo no está claro.
2. **Ofrecé opciones con tradeoffs.** Si hay que agregar un servicio, preguntá si va en el stack del cliente o compartido, si va en test primero, si rompe algo.
3. **Nunca modifiques archivos que afecten prod sin confirmación explícita.**
4. **Secrets no van al código.** Variable nueva → `.env.example` y mencionarlo. En n8n `$env`, en Docker `.env`.

## Tooling
- **Automation:** n8n (Queue Mode: Main + Worker + Redis)
- **Infra:** VPS Ubuntu 24.04 · 16GB RAM · 4 CPUs · Docker Compose · Traefik
- **DB:** PostgreSQL (pgvector) · MongoDB Atlas (vector search) · Redis
- **Apps:** Evolution API · Chatwoot · Google Sheets (CRM/inventory)
- **AI:** GPT-4.1-mini (OpenAI API)

## Key Commands
- `/new-spec` — Crear spec para un cambio significativo
- `/deploy` — Ejecutar deploy de spec aprobada
- `/diagnose` — Investigar problema en prod
- `/prime-architecture` — Análisis arquitectónico
- `/prime-debug` — Root cause analysis
- `/prime-workflow` — Optimización de workflows
- `/ingest [source]` — Procesar nueva fuente hacia la Wiki (Karpathy pattern)
- `docker logs [container]` — Ver logs
- `./scripts/deploy-workflow.sh` — Deploy de workflow (leer antes de ejecutar)
- `bash scripts/clear-chat-memory.sh 5491150635028 test` — Post-deploy obligatorio

## Project Structure
- `workflows/` — n8n JSON exports
- `Kairos_Brain/` — OBSIDIAN VAULT (Contexto unificado, docs, reglas, roadmap, memoria)
- `scripts/` — Deploy y utilidades
- `specs/` — Specs activas (`YYYY-MM-DD-nombre.md`) + `templates/`

## Session Start (OBLIGATORIO)
Leer SIEMPRE al inicio navegando la bóveda Obsidian (`Kairos_Brain/`):
1. `Kairos_Brain/Bienvenido.md` (Mapa de contenido principal)
2. `Kairos_Brain/Instrucciones Generales.md` (Reglas, Manifesto y SDD)
3. `Kairos_Brain/infra/Roadmap.md` y fichas en `Kairos_Brain/proyectos/`
4. Para Trebol v4: usar `/prime-v4` que carga Pipeline_v4, Workflow_v4_Reference, Roadmap, Malas/Buenas

## Bóveda en repo separado
`Kairos_Brain/` es un **nested checkout** del repo `git@github.com:5antuca/Boveda-Kairos-brain.git` (ignorado en `.gitignore` del repo principal). Cualquier edit al vault tiene que commitearse Y pushearse desde adentro de `Kairos_Brain/`, NO desde `kairos-infrastructure`. Usar `scripts/sync-vault.sh` para empujar ambos repos al mismo tiempo. Ver `Kairos_Brain/contexto-claude/Sincronizacion_Repos.md` para el flujo completo.

## LLM Wiki Operations (Karpathy Pattern)
1. **Ingest**: Cuando el usuario deja un archivo en `raw/` o pide procesar una fuente:
   - Leer la fuente, destilar aprendizajes clave.
   - Actualizar/Crear páginas en las carpetas de la Wiki (`infra/`, `proyectos/`, `personas/`).
   - Actualizar `index.md` con el nuevo contenido.
   - Registrar la operación en `log.md` (formato: `## [YYYY-MM-DD] ingest | Título`).
2. **Query**: Al responder preguntas, consultar primero `index.md` para localizar páginas relevantes en la Wiki. Si una respuesta es compleja y valiosa, ofrecer guardarla como una nueva página de la Wiki.
3. **Lint**: Periódicamente (o al inicio de sesión), revisar la Wiki buscando: contradicciones entre páginas, links rotos, u "orphan pages".

## Spec-Driven Development (SDD)
Flujo: `SPEC → PLAN → EJECUCIÓN → REVIEW → DOC`

**Requiere spec:** nuevo workflow · cambio en system prompt · nueva integración · cambio de arquitectura · nuevo cliente
**No requiere spec:** hotfix urgente · cambio de .env simple · restart · debugging

## Development Rules
1. **Verify First** — Nunca asumir estado; explorar `Kairos_Brain/` y `ls` el proyecto
2. **No secrets hardcodeados** — `$env` en n8n, `.env` en Docker
3. **Small diffs** — Cambios pequeños y dirigidos; sub-workflows para complejidad
4. **Act as:** Senior Platform Engineer (Docker + n8n + IA)

## Documentation Rule (OBLIGATORIO)
Ante cualquier cambio en: workflow · .env · container · DB · servicio · dominio/SSL · credencial n8n · system prompt → actualizar ANTES de cerrar la tarea:
1. `README.md` — Documentación general del VPS
2. Notas y fichas correspondientes en `Kairos_Brain/` (ej. roadmap, arquitectura o proyectos)

Leer ambos antes de editar. Nunca sobrescribir — siempre append/edit de la sección relevante.


