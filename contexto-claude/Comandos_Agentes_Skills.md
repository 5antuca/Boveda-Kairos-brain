---
tags: [contexto-claude, indice, comandos, agentes, skills, moc]
---

# 🤖 Comandos, Agentes y Skills de Claude Code

Este archivo es un **índice navegable** de todo lo que vive en `.claude/` (sub-agents, slash commands, skills, hooks, settings). Los archivos físicos NO se pueden mover porque Claude Code los lee desde `.claude/` por convención — moverlos rompe el runtime. Este index es la "vista Obsidian" de ese contenido.

> **Single source of truth**: `.claude/`. Si actualizás un agent o command, no hace falta tocar este index salvo que cambie su descripción/propósito.

---

## 🧑‍💻 Sub-agentes (`.claude/agents/`)

Sub-agentes invocables vía `Task` tool. Cada uno tiene un dominio acotado y herramientas específicas.

| Agente | Descripción | Archivo |
|---|---|---|
| **n8n-expert** | Especialista en automatización n8n y orquestación de workflows complejos. Debug ejecuciones fallidas, diseño con error handling, webhooks, custom JS, queue mode. | `.claude/agents/n8n-expert.md` |
| **workflow-architect** | Diseña o mejora la estructura de nodos de un workflow n8n. Trabaja desde una spec o desde JSON existente. | `.claude/agents/workflow-architect.md` |
| **spec-analyst** | Analiza requerimientos y crea specs para workflows de n8n. Convierte descripciones en lenguaje natural en specs técnicas estructuradas. | `.claude/agents/spec-analyst.md` |
| **prompt-engineer** | Escribe y mejora system prompts para agentes de IA en n8n. Especializado en tono rioplatense y contexto de concesionaria. | `.claude/agents/prompt-engineer.md` |
| **reviewer** | Valida specs y planes de workflow antes del deploy. Segunda opinión técnica. | `.claude/agents/reviewer.md` |
| **deploy-executor** | Ejecuta planes de deploy aprobados paso a paso. Docker Compose, importar workflows a n8n, backups antes de cambios destructivos, migraciones de DB. | `.claude/agents/deploy-executor.md` |
| **architecture-expert** | Arquitecto senior de infraestructura cloud y VPS multi-tenant. Decisiones de arquitectura, aislamiento de datos entre clientes, microservicios Node.js, optimización Docker, alta disponibilidad. | `.claude/agents/architecture-expert.md` |
| **ai-integration-expert** | Especialista en RAG, MongoDB vectorial y pipelines de IA para WhatsApp. Búsqueda semántica, optimización de prompts LLM, integración Evolution API, RAG. | `.claude/agents/ai-integration-expert.md` |

---

## ⚡ Slash Commands (`.claude/commands/`)

Comandos invocables con `/<nombre>` desde Claude Code.

### Prime / contexto
| Comando | Propósito | Archivo |
|---|---|---|
| `/prime` | Snapshot rápido del proyecto (git log, docker ps). | `.claude/commands/prime.md` |
| `/prime-v4` | Carga contexto completo de Trebol v4 (workflows, containers, redis keys, MOC, malas/buenas). | `.claude/commands/prime-v4.md` |
| `/prime-v3` | Carga contexto completo de Trebol v3 (legacy). | `.claude/commands/prime-v3.md` |
| `/prime-architecture` | Análisis arquitectónico del sistema, bottlenecks, multi-tenant scalability. | `.claude/commands/prime-architecture.md` |
| `/prime-debug` | Cargar contexto para debuggear problemas en producción (logs prod n8n). | `.claude/commands/prime-debug.md` |
| `/prime-workflow` | Optimización de workflows n8n: eficiencia, error handling, mantenibilidad. | `.claude/commands/prime-workflow.md` |

### Spec-Driven Development
| Comando | Propósito | Archivo |
|---|---|---|
| `/new-spec` | Crear spec estructurada para infra/workflow/prompt change usando metodología SDD. | `.claude/commands/new-spec.md` |
| `/new-workflow` | Crea un workflow n8n nuevo desde una descripción. Orquesta spec, arquitectura y prompt en paralelo. | `.claude/commands/new-workflow.md` |
| `/improve-workflow` | Mejora un workflow existente. Recibe nombre del JSON y el problema a resolver. | `.claude/commands/improve-workflow.md` |
| `/deploy` | Ejecuta el ciclo completo de deploy de una spec aprobada: plan → review → execute → verify → document. | `.claude/commands/deploy.md` |
| `/diagnose` | Root cause analysis sistemático para production issues, extiende `prime-debug` con SDD. | `.claude/commands/diagnose.md` |

### Sesiones
| Comando | Propósito | Archivo |
|---|---|---|
| `/load-bundle` | Carga contexto de una sesión anterior desde un bundle JSONL en `agents/context_bundles/`. | `.claude/commands/load-bundle.md` |

---

## 🎨 Skills (`.claude/skills/`)

Skills declarativas que Claude Code carga on-demand.

| Skill | Propósito | Archivo |
|---|---|---|
| **defuddle** | Extrae markdown limpio de páginas web con Defuddle CLI (sin clutter/nav). Usar en lugar de WebFetch para URLs estándar. | `.claude/skills/defuddle/SKILL.md` |
| **json-canvas** | Crear y editar archivos `.canvas` de Obsidian (nodes, edges, groups). Mind maps, flowcharts. | `.claude/skills/json-canvas/SKILL.md` |
| **obsidian-bases** | Crear y editar Obsidian Bases (`.base`) con views, filters, formulas, summaries. | `.claude/skills/obsidian-bases/SKILL.md` |
| **obsidian-cli** | Interactuar con vaults Obsidian desde la CLI: leer, crear, buscar, gestionar notas. También para desarrollo de plugins/themes. | `.claude/skills/obsidian-cli/SKILL.md` |
| **obsidian-markdown** | Crear y editar Obsidian Flavored Markdown: wikilinks, embeds, callouts, properties, tags. | `.claude/skills/obsidian-markdown/SKILL.md` |

---

## 🪝 Hooks (`.claude/hooks/`)

| Hook | Propósito | Archivo |
|---|---|---|
| **context_bundle_builder.py** | Bundler de contexto de sesión a JSONL para `/load-bundle`. | `.claude/hooks/context_bundle_builder.py` |

---

## ⚙️ Settings y configuración (`.claude/`)

| Archivo | Función |
|---|---|
| `.claude/settings.json` | Configuración compartida del proyecto (commiteada) |
| `.claude/settings.local.json` | Configuración local del usuario (gitignored) |
| `.claude/mcp.json` | Servidores MCP habilitados |
| `.claude/README.md` | README del directorio `.claude/` |

---

## 📋 Spec Templates (`.claude/specs/templates/`)

Plantillas usadas por `/new-spec`. Cada template tiene secciones: contexto, problema, propuesta, alternativas, riesgos, plan de testing, plan de rollback.

| Template | Cuándo usarlo | Archivo |
|---|---|---|
| **workflow-change** | Cambio en un workflow n8n existente (nodos, lógica, conexiones) | `.claude/specs/templates/workflow-change.md` |
| **infra-change** | Cambio en infraestructura del VPS (containers, networks, volumes, env) | `.claude/specs/templates/infra-change.md` |
| **prompt-change** | Cambio en system prompt de un AI Agent | `.claude/specs/templates/prompt-change.md` |
| **new-integration** | Nueva integración con servicio externo (API, webhook, credential) | `.claude/specs/templates/new-integration.md` |

---

## 🗄️ Otros archivos en `.claude/`

| Archivo | Función |
|---|---|
| `.claude/ai_agent_dump.json` | Dump del system prompt actual del AI Agent de Trebol v4 (snapshot para reference) |
| `.claude/clasificador.js` | Snippet del clasificador determinístico (171 líneas regex) |
| `.claude/clasificador.js.bak` | Backup del clasificador |

---

## 🔗 Contexto técnico relacionado en la bóveda

- [[Architecture_Index]] — índice general del sistema
- [[Engineering_Manifesto]] — mindset de ingeniería
- [[Rules_n8n]] — reglas estrictas de n8n
- [[Preferencias_Arquitectura]] — cómo trabaja Santi
- [[Scripts_y_Herramientas]] — scripts del repo
- *(cliente histórico — Trébol Automotores, ex-producción)* — dashboard del proyecto Trebol
