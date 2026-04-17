---
tags: [trebol, bad-conv, postmortem, cuotas, clasificador, anticipo, redis]
fecha: 2026-04-17
estado: DIAGNOSED — 2 bugs root-cause
---

# Bad Conv — DS3 cuotas sin anticipo + "ok dale" no dispara handoff

## Transcripción

| Turno | Quién | Mensaje |
|---|---|---|
| T1 | Cliente | ML link DS3 1.6 Thp 156 Sport Chic |
| T1 | Bot | Ficha DS3 ($16.000 / anticipo mín $11.000) + pide nombre ✅ |
| T2 | Cliente | "santi / financiacion tienen?" |
| T2 | Bot | Opciones financiación + "¿querés simulación? decime tu anticipo" ✅ |
| T3 | Cliente | "dale haceme una simulacion de la 2" |
| T3 | Bot | ❌ **Calcula cuotas con anticipo=0**: "A financiar: U$S 16.000 (sin anticipo)" — cuotas 3/6/12m + "te conecto con asesor" |
| T4 | Cliente | "dale" |
| T4 | Bot | ❌ "Perfecto." — NO dispara handoff. No apaga bot. No alerta vendedor. |

## Root cause — 2 bugs encadenados

### Bug A — Clasificador no detecta "haceme una simulación" como categoría `cuotas`

**Evidencia exec 22352**: `clasificador de intención` con `menssaje_final_cadena: "dale haceme una simulacion de la 2"` devolvió `categoria: "comercial"`.

Las keywords de `cuotas` en el clasificador son:
```js
cuotasKeywords = [
  'simulacion de cuotas', 'simulación de cuotas',
  'simular cuotas', 'cuántas cuotas', 'cuantas cuotas',
  'en cuotas', 'quiero cuotas', 'pagar en cuotas',
  'cuotas'
];
```

"simulacion" sola (sin "de cuotas") no matchea. "simular" sola tampoco. Entonces el cliente dijo "simulación" pero la categoría cayó en `comercial` → no pasó por el case `cuotas` de `Construir Instrucción` (que tiene guard determinístico "preguntar anticipo si no hay") → AI Agent llamó `calcular_cuotas` con `anticipo=0`.

**Consecuencia**: cuotas calculadas sobre el precio contado completo → valores ridículos ("U$S 6.420 a 3 meses para un auto de U$S 16.000").

### Bug B — `Redis GET offered_contact` devuelve `.propertyName`, pero `Evaluar Alerta` lee `.value`

**Evidencia exec 22352**:
- Bot cerró con "te conecto con un asesor" → `Evaluar Alerta` matcheó → `esOfertaCondicional: true` → **`Redis SET offered_contact` ejecutó correctamente** ✓

**Evidencia exec 22358** (turno "ok dale"):
- `Redis GET offered_contact output`: `{"propertyName": "true"}` ← la key está guardada correctamente en Redis
- Pero en `Evaluar Alerta`:
```js
const raw = $('Redis GET offered_contact').first().json.value;  // undefined !!
offeredContact = raw === 'true' || raw === true;               // false
```
El código lee `.value` pero el nodo Redis GET devuelve `.propertyName` (default cuando no se setea `propertyName` en el nodo).

**Consecuencia**: `esConfirmacionPostOferta = false` → no dispara handoff → cliente dice "dale" y el bot queda colgado / preguntando otra cosa.

## Clase del bug

- **Bug A** = gap en clasificador regex (fácil fix)
- **Bug B** = key mismatch Redis ↔ code (fácil fix, riesgo de regresión nulo)

Ambos combinados producen: "cuotas sin anticipo" + "ok dale" → `calcular_cuotas` con 0 + handoff colgado.

## Política del usuario aplicable

Cuando no hay anticipo → el bot debería **pedirlo** o (si ya se pidió 1 vez) **derivar a admin**.
Nunca simular cuotas sin anticipo.

## Fix requerido

Ver spec `specs/2026-04-17-trebol-v4-clasificador-cuotas-y-handoff-hardening.md`

## Escenario de regresión

| Turno | Input | Esperado | Anti-patrón |
|---|---|---|---|
| T1 | ML DS3 | Ficha + pide nombre | — |
| T2 | "santi / tienen financiación?" | Opciones + pide anticipo | — |
| T3 | "haceme una simulación" (sin monto) | ❌ NO calcular. Debe decir "¿cuánto tenés de anticipo?" | Calcular con 0 |
| T4 | "dale" sobre "te conecto asesor" | Handoff duro (bot-off + alerta) | Responder "Perfecto" sin más |

## Links

- [[Malas]]
- [[bad-conv-20260417-v4-passat-ml-vehiculo-sobrescrito]] (mismo flow roto)
- Spec: `specs/2026-04-17-trebol-v4-clasificador-cuotas-y-handoff-hardening.md`
