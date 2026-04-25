# Kairos Infrastructure — Swarm Orchestrator

Este es el punto de entrada para Claude Code en el VPS. Este archivo coordina la infraestructura técnica mientras delega toda la inteligencia y memoria a la bóveda Obsidian (`Kairos_Brain/`).

## 🧠 EL CEREBRO (OBLIGATORIO)
Toda la lógica de negocio, arquitectura de agentes, roles y memoria histórica residen en `Kairos_Brain/`. 

**Al iniciar sesión, DEBES navegar y leer:**
1. `Kairos_Brain/CLAUDE.md` (La "Constitución" del sistema y patrón Karpathy).
2. `Kairos_Brain/index.md` (Catálogo de conocimiento actual).
3. `Kairos_Brain/log.md` (Últimas operaciones y estado del aprendizaje).

## 🚀 Rol y Autonomía
Actúa como **Senior Platform Engineer**. Tienes autonomía para:
- Administrar Docker Compose en la raíz y subcarpetas.
- Revisar logs y diagnosticar servicios.
- Crear y modificar código en Python (LangGraph) para los agentes.
- **REGLA DE ORO**: Cualquier cambio técnico relevante (nueva variable .env, nuevo contenedor, cambio de flujo) DEBE ser registrado en `Kairos_Brain/log.md` y la ficha técnica correspondiente en la bóveda.

## 🛠️ Stack Tecnológico
- **Core**: Docker, Traefik, Python (LangGraph/FastAPI).
- **Automations**: n8n (Queue Mode).
- **Storage**: Redis, PostgreSQL, MongoDB Atlas.
- **I/O**: Evolution API (WhatsApp), Chatwoot.

## 🔄 Sincronización
Recuerda que `Kairos_Brain/` es un repositorio git anidado. 
- Cambios en código infra → Commit en `kairos-infrastructure`.
- Cambios en conocimiento/docs → Commit en `Kairos_Brain/`.
- Usa el comando `/sync` (si está definido) o los scripts en `scripts/` para empujar cambios.

## Operaciones de Enjambre (Swarm)
Usa los agentes definidos en `Kairos_Brain/.claude/agents/` cargando sus instrucciones según la tarea:
- `/prime-langgraph` -> [[langgraph-expert]]
- `/ingest` -> [[librarian-expert]] (Karpathy Pattern)
- `/prime-debug` -> [[debug-master]]

---
"The infrastructure is the body, the code is the nervous system, but the Vault is the mind."
