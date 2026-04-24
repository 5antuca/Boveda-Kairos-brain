---
description: Preparar el contexto para diagnosticar fallos en el enjambre
---

# Prime: Swarm Debug

## Run
docker ps --format "table {{.Names}}\t{{.Status}}"
df -h
free -m

## Read
Kairos_Brain/infra/Agent_Swarm_Architecture.md
.claude/agents/debug-master.md

## Report
Asume inmediatamente la persona de `debug-master`. Identifica qué contenedores están corriendo y pregunta al usuario qué síntoma está experimentando para poder aislar si el fallo está en la capa I/O (n8n) o en el núcleo cognitivo (LangGraph).
