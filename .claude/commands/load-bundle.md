---
description: Carga el contexto de una sesión anterior desde un bundle JSONL en agents/context_bundles/
allowed-tools: Read, Bash
---

# Load Bundle

Input esperado: ruta al archivo JSONL
Ejemplo: `agents/context_bundles/SAT_06_abc123.jsonl`

## Workflow
1. Leer el archivo JSONL línea por línea
2. Para cada operación `read` → leer el archivo correspondiente
3. Para cada operación `write` → notar qué se modificó
4. Para cada operación `prompt` → entender qué se ejecutó
5. Deduplicar lecturas repetidas

## Report
- Qué hizo el agente anterior (resumen en 5 líneas)
- Archivos leídos y modificados
- Estado en que quedó el trabajo
- Próximo paso lógico
