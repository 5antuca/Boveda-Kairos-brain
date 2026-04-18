---
tags: [trebol, bot-python, bad-conv, postmortem, parser, debounce, anticipo, json]
fecha: 2026-04-17
bot: LangGraph Python
estado: FIXED test 2026-04-17
---

# Bad Conv — S10: JSON crudo + respuestas duplicadas + confusión anticipo mínimo vs contado

## Transcripción (turnos clave)

| Turno | Quién | Tiempo | Mensaje |
|---|---|---|---|
| T1 | Cliente | 21:13:59 | ML link Chevrolet S10 2.8 High Country |
| T1 | Bot | 21:14:16 | Ficha S10 (contado 28k / anticipo 20.5k) ✅ |
| T2a | Cliente | 21:14:31 | "tengo 21000 usd" |
| T2b | Cliente | 21:14:35 | "como lo podemos financiar?" (+4s) |
| T2a | Bot | 21:14:45 | Financiación (correcto) |
| T2b | Bot | 21:14:49 | **Financiación OTRA VEZ duplicada** ❌ (+4s, no se agruparon) |
| T3a | Cliente | 21:15:03 | "ok dale" |
| T3b | Cliente | 21:15:06 | "pongo 21000" |
| T3c | Cliente | 21:15:09 | "de anticipo" |
| T3a | Bot | 21:15:13 | "¿Cuánto tenés de anticipo?" |
| T3b | Bot | 21:15:19 | Cuotas bien calculadas ✅ |
| T3c | Bot | 21:15:22 | ❌ **"Tu presupuesto no alcanza..."** + **JSON crudo** pegado abajo |

## Bugs

### Bug A — JSON crudo enviado al cliente

El último mensaje del bot tenía DOS cosas:
```
Tu presupuesto no alcanza para cubrir el anticipo mínimo, pero ya te pongo en contacto...
{"mensaje1":"Tu presupuesto no alcanza...","fotos_mensaje1":[],...}
```

**Root cause**: El LLM devolvió texto plano + JSON al final. `json.loads(raw)` falló (no era JSON desde el inicio) → el parser devolvió el raw sin procesar → Chatwoot recibió todo el texto incluido el JSON.

**Fix**: parser robusto en `_parse_agent_response`. Cascada de 3 intentos:
1. `json.loads(raw)` directo.
2. Regex `{..."mensaje1":...}` dentro del raw.
3. `raw[raw.find('{'):raw.rfind('}')+1]`.
Si nada funciona → remover cualquier fragmento tipo `{"mensaje1":...}` del texto antes de enviar, para que el cliente nunca vea JSON.

### Bug B — Respuestas duplicadas por ventana de debounce muy corta (PENDIENTE)

Cliente escribió "ok dale" / "pongo 21000" / "de anticipo" en 3 mensajes separados (3s apart cada uno). El debounce de 3s expiraba justo antes del siguiente mensaje → cada uno disparó su propio turno del bot → 3 respuestas.

**Decisión usuario (2026-04-17)**: no subir el debounce. Razón: aumenta latencia percibida para el caso común donde el cliente escribe un único mensaje.

**Alternativas a evaluar** (sin cambiar el debounce):
- Detectar redundancia semántica en el backend: si la respuesta del bot ya contiene info que cubre los siguientes mensajes en cola, merger.
- Cuando procesa un mensaje corto post-processing reciente (<10s), concatenarlo con el último turno en vez de generar respuesta nueva.
- Un "post-processing defer": si hay mensajes en cola cuando el bot termina, esperar 2s extra antes de enviar para ver si vienen más.

No aplicado en esta iteración — queda como backlog.

### Bug C — LLM confundió ANTICIPO MÍNIMO con CONTADO

Cliente "pongo 21000 de anticipo". Auto S10: contado 28.000 / anticipo mín 20.500.

Razonamiento correcto: `20.500 ≤ 21.000 < 28.000` → CASO 2 → financiación.
Razonamiento del LLM: "21.000 < 28.000 → no alcanza el anticipo" → ❌ activó frase de handoff (CASO 1).

El LLM comparó contra el precio CONTADO en lugar de contra el ANTICIPO MÍNIMO.

**Fix**: reforzar el prompt con:
- Nombres explícitos de los 2 números clave (CONTADO vs ANTICIPO MÍNIMO)
- Regla clave en texto plano al inicio del bloque
- Ejemplo EXACTO del S10 + 21000 como anti-patrón conocido ("INCORRECTO: ... / CORRECTO: ...")

## Fix aplicado (2026-04-17 test)

### `agent/graph.py _parse_agent_response`
- Cascada de 3 parsers JSON + fallback que **remueve** fragmentos `{"mensaje1":...}` del raw antes de devolver.

### `configs/trebol.yaml`
**Revertido** — debounce queda en 3.0 por pedido del usuario. Bug B queda como backlog (ver sección "Bug B" arriba para alternativas).

### `configs/prompts/trebol.txt`
Reforzada sección **⛔ VEHÍCULO ESPECÍFICO + PRESUPUESTO** con:
- Nombres explícitos CONTADO / ANTICIPO MÍNIMO
- Ejemplos A (Passat) y B (S10) para el CASO 2
- Bloque `⛔ ERROR COMÚN` con el anti-patrón S10 + 21k

## Validación

Unit test parser:
```python
raw = 'Tu presupuesto no alcanza...\n{"mensaje1":"Tu presupuesto..."}'
text, urls = _parse_agent_response(raw)
# text NO contiene '{"mensaje1': OK
```

Smoke test S10 + 21000:
- Esperado: "podés sacarlo financiado" / "opciones de financiación"
- NO esperado: "tu presupuesto no alcanza"
- Resultado real: ✅ Mencionó financiación, no dijo "no alcanza"

## Links

- [[Malas]]
- [[LangGraph_Bot]]
- [[bad-conv-20260417-v4py-passat-presupuesto-insuficiente-hola-duplicado]] — caso análogo (presupuesto vs anticipo)
