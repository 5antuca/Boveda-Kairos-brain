---
tags: [trebol, bad-conv, postmortem, anticipo, handoff, bot-off]
fecha: 2026-04-17
estado: FIXED (test 2026-04-17)
---

# Bad Conv — DS3 anticipo insuficiente en loop

## Transcripción

| Turno | Quién | Mensaje |
|---|---|---|
| T1 | Cliente | "Hola, tengo algunas preguntas sobre D·s Ds3 1.6 Thp 156 Sport Chic. [ML link]" |
| T2 | Bot | Ficha DS3: U$S 16.000 contado, anticipo mínimo U$S 11.000 ✅ |
| T3 | Bot | "¿Cómo te llamás?" ✅ |
| T4 | Cliente | "santi" / "tengo 10000" / "lo puedo sacar con financiacion?" |
| T5 | Bot | "Tu anticipo de U$S 10.000 no alcanza para DS3 (mínimo U$S 11.000), pero si querés te puedo poner en contacto con administración..." ✅ |
| T6 | Bot | **DUPLICADO** — mismo mensaje anticipo ❌ |
| T7 | Cliente | "ok dale" |
| T8 | Bot | **REPETICIÓN** — mismo mensaje anticipo de nuevo ❌ |

## Diagnóstico

**Bug 1 — Duplicación (T6)**: Ejecuciones 22171 y 22174 corrieron en paralelo (O6 debounce race condition). Los 3 mensajes del cliente llegaron en ~10s y 2 workers los agarraron antes de que el lock se estableciera. Cada uno generó la respuesta de anticipo.

**Bug 2 — Loop "ok dale" (T8)**: 
- El mensaje de anticipo contenía "si querés **te puedo poner en contacto**" → `Evaluar Alerta` detecta `esOfertaCondicional = true` → NO dispara bot-off, espera confirmación del cliente.
- "ok dale" (exec 22183) → categoria: `comercial` → AI Agent ve historia conversacional → regenera mismo mensaje de anticipo.
- El flag `offered_contact` Redis no llegó a estar activo para "ok dale" (timing/race condition con los 2 ejecuciones paralelas de T5/T6).

## Root Cause

La instrucción de anticipo insuficiente en `Construir Instrucción` decía `"mensaje1": ""` → el LLM llenaba el mensaje con frases condicionales ("si querés te puedo poner en contacto") → `Evaluar Alerta` las reconocía como oferta condicional (no handoff directo) → no activaba bot-off → el cliente podía seguir hablando con el bot.

## Fix (deployado en test 2026-04-17)

**`Construir Instrucción` — bloque anticipo insuficiente**: pre-llenar `mensaje1` con mensaje que incluye "**Ya te pongo en contacto con administración**" — frase en `frasesHandoffDirecto` de `Evaluar Alerta` → `esHandoffBot = true` → bot-off se dispara en el mismo turno, sin necesitar "ok dale".

Mensaje resultante: "Tu anticipo de U$S X no alcanza para [auto] (mínimo U$S Y). **Ya te pongo en contacto con administración** para que armen un plan a medida."

## Clase del bug

- Handoff condicional que no cierra el loop
- Downstream: O6 debounce race condition (preexistente, no resuelto en este fix)

## Pendiente prod

Promover a prod cuando se valide en test.
