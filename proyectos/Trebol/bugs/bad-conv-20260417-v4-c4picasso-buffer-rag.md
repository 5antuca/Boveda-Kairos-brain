---
tags: [trebol, bad-conv, postmortem, buffer, rag, webhook]
fecha: 2026-04-17
estado: FIXED webhook (test 2026-04-17) — RAG pendiente validar
---

# Bad Conv — C4 Picasso: buffer ×15 + RAG vacío + nombre repetido

## Transcripción

| Turno | Quién | Mensaje |
|---|---|---|
| T1 | Cliente | ML link C4 Picasso + "hola tienen financiacion?" |
| T2 | Bot | Opciones de financiación ✅ |
| T3 | Bot | "¿Cómo te llamás?" ✅ |
| T4 | Cliente | "tengo 12000" / "como quedarian las cuotas?" / "santi mi nombnre" |
| T5 | Bot | "No tengo Citroën Grand C4 Picasso en stock... confirmame tu nombre" ❌ |

## Bugs

**Bug 1 — Buffer × 15 (raíz de todo)**: El webhook n8n en Queue Mode con `responseMode` por defecto (lastNode) mantiene la conexión HTTP abierta hasta que termina el workflow (~17s). Chatwoot hace timeout y reintenta 15 veces por mensaje. Cada reintento pushea al buffer → buffer llega con 45 entradas (15×3 mensajes). El AI Agent recibió 45 líneas de contexto repetido → llamó `buscar_inventario_autos` con input vacío `{}` → 0 resultados → "no hay stock".

**Bug 2 — RAG false negative**: `buscar_inventario_autos` recibió `{}` porque el AI estaba confundido por el contexto × 15. El auto SÍ existe en MongoDB (ID-17707245690902B78, precio $14.800, anticipo mínimo $10.500).

**Bug 3 — Nombre preguntado después de darlo**: Mismo origen (buffer × 15). El AI veía el mensaje concatenado 45 veces pero interpretaba el contexto de forma errática.

**Bug 4 — CRM vehiculo = DS3 en vez de C4 Picasso**: El clear script limpiaba "row 4" hardcodeado, pero el cliente estaba en fila 59. En exec 22200 (primera interacción) `Buscar Cliente CRM` devolvió el DS3 del turno anterior → `Construir Instrucción` le decía al AI "Vehículo en CRM: Ds3 1.6 Thp 156 Sport Chic" → AI buscaba DS3.

## Root cause final

**Webhook `responseMode: "lastNode"` (default)** → n8n retiene conexión HTTP hasta fin del workflow → Chatwoot reintenta 15 veces → buffer se satura → AI Agent confundido → herramientas se llaman sin parámetros.

## Fix (deployado en test 2026-04-17)

`Webhook chatwoot`: `responseMode: "onReceived"` → n8n responde HTTP 200 inmediatamente al recibir el webhook, procesa en background. Chatwoot ya no reintenta.

## Pendiente

- Validar que buffer ya no acumula × 15 post-fix
- Verificar RAG con buffer limpio (el C4 Picasso debería aparecer)
- Fix CRM clear script para buscar por teléfono en vez de row 4 hardcodeado
