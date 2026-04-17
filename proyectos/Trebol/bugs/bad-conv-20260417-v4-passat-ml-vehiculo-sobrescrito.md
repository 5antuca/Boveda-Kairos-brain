---
tags: [trebol, bad-conv, postmortem, ml-link, vehiculo-interes, extraer-datos-crm, llm-drift]
fecha: 2026-04-17
estado: DIAGNOSED — fix pendiente
---

# Bad Conv — Passat ML link: vehiculo sobrescrito por alternativas del bot

## Transcripción

| Turno | Quién | Mensaje |
|---|---|---|
| T1 | Cliente | Hola, preguntas sobre **Volkswagen Passat 3.2 V6 Fsi Highline** [ML link] |
| T1 | Bot | Ficha Passat ($13.500) + "¿Cómo te llamás?" ✅ |
| T2 | Cliente | "santi mi nombre / tengo 11 mil dolares / lo puedo sacar por cuotas?" |
| T2 | Bot | Explica opciones de financiación (banco / propia) + "¿con qué anticipo?" ✅ |
| T3 | Cliente | "dale si haceme una simulacion de financiacion propia / 11 mil dolares pongo" |
| T3 | Bot | ❌ "¿Para cuál vehículo te interesa la simulación? 1️⃣ **Chevrolet Captiva** 2️⃣ **Chevrolet Tracker**" |

El bot ofrece Captiva y Tracker cuando el cliente claramente pregunta por el Passat (único auto de la conversación).

## Root cause — cascada de 3 bugs

### Bug A — LLM drift en categoria=cuotas sin anticipo (T2)

`Construir Instrucción` con `categoria=cuotas` y `anticipo_detectado=null` armó un JSON pidiendo *exactamente* "¿Cuánto tenés de anticipo?" con `PROHIBIDO buscar vehículos ni mostrar fichas`.

Pero el AI Agent tuvo **3 runs paralelos en el mismo exec** (22287) porque los 3 mensajes del cliente llegaron combinados:
- Run 0 ("santi mi nombre"): "¿Cómo te llamás?" ✓
- Run 1 ("tengo 11 mil dolares"): ❌ "Tenemos estas opciones: Captiva U$S 11.500 + Tracker U$S 13.000" ← **el LLM alucinó alternativas pese a la prohibición**
- Run 2 ("lo puedo sacar por cuotas?"): "Opciones de financiación..." ✓

### Bug B — `Extraer Datos CRM` extrae autos OFRECIDOS por el bot como `auto_interes` del cliente

`Extraer Datos CRM` corrió una sola vez al final del exec 22287. Leyó TODOS los outputs del bot concatenados (incluyendo el Run 1 alucinado con Captiva/Tracker) y extrajo:

```json
{
  "nombre": "santimi",
  "auto_interes": ["Chevrolet Captiva 2.0 Vcdi Ltz At", "Chevrolet Tracker 1.8 Ltz Fwd Mt 140cv Mt"],
  "presupuesto": 11000
}
```

Confundió "lo que el bot ofreció" con "lo que el cliente pidió". No hay distinción semántica en el prompt del extractor.

### Bug C — Sobreescribe `VEHICULO DE INTERÉS` sin verificar

`Actualizar Sheet CRM` (appendOrUpdate matchingColumns=TEL) hizo UPDATE con `VEHICULO DE INTERÉS: "Chevrolet Captiva 2.0 Vcdi Ltz At Chevrolet Tracker 1.8 Ltz Fwd Mt 140cv Mt"` (concatenación del array sin separador).

**Sobreescribió el "Volkswagen Passat 3.2 V6 Fsi Highline" que venía del ML link de T1**. No hay guard contra "si ya hay un vehiculo confirmado por ML link, no lo pises".

### Consecuencia en T3

Exec 22299: `Buscar Cliente CRM` lee `VEHICULO DE INTERÉS = "Captiva + Tracker"` → `Construir Estado CRM` dice "Vehículo buscado: ✅ Captiva + Tracker" → AI Agent al pedir simulación ofrece exactamente esos 2 autos.

## Fixes posibles

### Fix 1 — Prevenir el drift (Construir Instrucción)
En `categoria=cuotas` sin anticipo, pre-fillear `mensaje1` con frase fija `"¿Cuánto tenés de anticipo para la simulación?"` igual que hicimos con `anticipo insuficiente`. El LLM no genera output nuevo.

### Fix 2 — Lockear vehículo del ML link (Extraer Datos CRM)
Si ya hay `VEHICULO DE INTERÉS` no vacío en CRM (viene del ML link de T1), NO sobreescribir salvo que el cliente mencione EXPLÍCITAMENTE otro vehículo. Chequear:
- ¿El mensaje del cliente (no del bot) tiene una marca/modelo distinto?
- Si no → mantener el vehiculo existente.

### Fix 3 — Distinguir "bot ofrece" vs "cliente pide" en el extractor
En el prompt de `Extraer Datos CRM`: "SOLO extraer `auto_interes` si el **cliente** lo menciona explícitamente. NUNCA extraer de las alternativas que el bot mostró."

### Fix 4 — Derivar a admin en vez de ofrecer alternativas (política "derivar ante duda")
Cuando el cliente entró por ML link con vehículo confirmado y pide cuotas, el flow debería ser:
- Si anticipo alcanza → calcular cuotas del Passat.
- Si no alcanza → handoff a admin (la política nueva).
- Nunca "te ofrezco otros autos" (eso alimenta el drift).

## Recomendación

Aplicar **Fix 1 + Fix 2** en conjunto:
- Fix 1 previene el drift raíz (el LLM ya no tiene chance de mostrar alternativas).
- Fix 2 defensa en profundidad (si el LLM sigue driftando por otro path, el CRM no se contamina).

Fix 3 complementario (bajo). Fix 4 está cubierto por la política general del roadmap — no requiere cambio ad-hoc.

## Escenario de regresión

| Turno | Input | Esperado | Anti-patrón |
|---|---|---|---|
| T1 | ML link Passat | Ficha Passat + pide nombre | — |
| T2 | "santi / 11 mil / cuotas?" | "¿cuánto de anticipo?" (SIN mostrar alternativas) | ❌ mostrar Captiva/Tracker |
| T3 | "11 mil pongo" | Simulación de cuotas del **Passat** | ❌ pedir elegir entre Captiva/Tracker |

Validación: `VEHICULO DE INTERÉS` en CRM debe seguir siendo "Volkswagen Passat..." al final de T3.

## Links

- [[Malas]] — índice
- [[bad-conv-20260417-v4-ds3-anticipo-loop]] — caso análogo (pre-fill mensaje1 para evitar drift)
- [[bad-conv-20260410-v4-matias-debounce-anticipo]] — Bug E similar (pedir nombre/presupuesto con vehiculo ML ya matcheado)
