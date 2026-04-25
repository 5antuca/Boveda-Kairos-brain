---
description: Ingestar una nueva fuente a la Wiki (Patrón Karpathy)
---

# Command: /ingest

## Run
git log --oneline -3

## Read
CLAUDE.md
.claude/agents/librarian-expert.md
raw/

## Report
Asume la persona de `librarian-expert`. 
1. Pregunta al usuario qué archivo de `raw/` desea procesar o si tiene un nuevo texto para ingestar.
2. Una vez recibido, procede a leerlo y realizar la síntesis incremental en la Wiki, actualizando `index.md` y `log.md`.
