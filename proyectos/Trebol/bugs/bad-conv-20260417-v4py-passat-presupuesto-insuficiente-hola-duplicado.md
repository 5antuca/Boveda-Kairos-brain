---
tags: [trebol, bot-python, bad-conv, postmortem, presupuesto, financiacion, saludo]
fecha: 2026-04-17
bot: LangGraph Python (post cutover test)
estado: FIXED test 2026-04-17
---

# Bad Conv — Passat: presupuesto insuficiente → cambio de auto (en lugar de ofrecer financiación) + Hola duplicado

## Transcripción

| Turno | Quién | Mensaje |
|---|---|---|
| T1 | Cliente | ML link **Volkswagen Passat 3.2 V6 Fsi Highline** / "hola lo puedo pasar a ver?" / "tengo 11000 cash" |
| T1.a | Bot | "¡Hola! Hablás con Santi... Tengo esta opción [ficha Passat — contado U$S 13.500, anticipo U$S 9.500]. Decime qué querés saber." ✅ |
| T1.b | Bot | ❌ **"¡Hola!** Para ese Volkswagen Passat 3.2 V6 FSI Highline el precio contado es U$S 13.500, que está por encima de los U$S 11.000 que tenés. ¿Querés que te muestre otras opciones de Volkswagen Passat o de autos similares dentro de ese presupuesto?" |

## Bugs

### Bug A — "Presupuesto < contado ≠ no podés"

Cliente dijo "tengo 11.000 cash". El auto es U$S 13.500 contado, U$S 9.500 anticipo mínimo. Entonces:

- 11.000 ≥ 9.500 (anticipo mínimo) → **PODÉS FINANCIARLO**
- El bot no debería cambiar de auto.

**Comportamiento correcto**: "Con U$S 11.000 de anticipo podés sacar el Passat financiado. Te paso las opciones de financiación: [opciones]".

**Root cause**: la regla existía en el prompt (`anticipo_mínimo ≤ presupuesto < contado → puede financiar`) pero estaba escondida en un bloque largo. El LLM priorizó la regla `⛔ PROHIBIDO mostrar vehículos con precio contado > techo` (que aplica a BÚSQUEDA, no a vehículo YA elegido por ML link).

### Bug B — "Hola" en 2 mensajes del mismo turno

Bot respondió con 2 burbujas separadas, cada una empezando con "¡Hola!". Output JSON del LLM:
```json
{
  "mensaje1": "¡Hola! Hablás con Santi... [ficha]",
  "mensaje2": "¡Hola! Para ese Volkswagen Passat el precio..."
}
```

**Root cause**: el LLM no sabe que cada `mensajeN` se envía como bubble separada a WhatsApp. Trató cada uno como conversación independiente y saludó en ambos.

## Fix aplicado (2026-04-17 test)

### Fix A — Regla explícita en prompt

`configs/prompts/trebol.txt` — agregar sección **⛔ VEHÍCULO ESPECÍFICO + PRESUPUESTO < CONTADO**:

```
⛔ VEHÍCULO ESPECÍFICO + PRESUPUESTO < CONTADO (caso crítico):
Si el cliente vino por ML link o pidió un vehículo puntual Y su presupuesto/cash
ES MENOR al precio contado PERO MAYOR O IGUAL al anticipo mínimo → el auto SÍ es
alcanzable con financiación. PROHIBIDO cambiar de vehículo u ofrecer alternativas.
Respuesta EXACTA:
  "¡Buenísimo! Con U$S [presupuesto] de anticipo podés sacar el [vehículo]
  financiado. Te paso las opciones de financiación:" + llamar OPCIONES DE FINANCIACION.
Ejemplo: Passat contado U$S 13.500 / anticipo mín U$S 9.500. Cliente dice
"tengo 11.000 cash". 11.000 ≥ 9.500 → ofrecer financiación del Passat
(no otras alternativas).
Solo si presupuesto < anticipo mínimo → derivar a admin.
```

### Fix B — Regla "Hola solo en mensaje1" + enforcement determinístico

`configs/prompts/trebol.txt`:
```
⛔ "¡Hola!" VA SOLO EN `mensaje1`. PROHIBIDO incluir "¡Hola!" o "Hola" al principio
de `mensaje2` o `mensaje3` del mismo turno. Cada mensaje del JSON es una burbuja
separada en WhatsApp — no podés saludar dos veces. `mensaje2` continúa sin saludo.
```

**Defensa en profundidad** — `agent/graph.py _parse_agent_response`: si el LLM ignora la regla, regex determinístico elimina "¡Hola!"/"Hola" al inicio de `mensaje2` y `mensaje3` (no de `mensaje1`):

```python
if i != "1" and clean_msg:
    clean_msg = re.sub(r"^\s*(?:¡?hola[!,.]?\s*)+", "", clean_msg, flags=re.IGNORECASE).lstrip()
```

## Categoría

- Clase A: Falta regla explícita para caso común (vehículo específico + presupuesto ajustado).
- Clase B: LLM no entiende el mapping 1 mensaje JSON = 1 burbuja WhatsApp.

## Validación

Escenario de regresión:
| Turno | Input | Esperado |
|---|---|---|
| T1 | ML Passat + "tengo 11000 cash" | Ficha + "Con 11.000 podés sacarlo financiado, te paso las opciones" (SIN alternativas, SIN "Hola" duplicado) |
| T2 | "ok dale" | Opciones financiación + handoff trigger |

## Links

- [[Malas]]
- [[LangGraph_Bot]]
- [[Sesion_2026-04-17_Bugs_y_Observabilidad]]
