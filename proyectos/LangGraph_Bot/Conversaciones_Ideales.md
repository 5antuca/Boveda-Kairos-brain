---
tags: [proyecto, langgraph, sales-bot, few-shot, ejemplos, conversaciones]
fecha_inicio: 2026-04-27
estado: En construcción — agregar conversaciones a medida que aparezcan casos
prioridad: alta — input directo para Fase 3 de la metodología
---

# Conversaciones ideales — biblioteca de ejemplos para few-shot

Este archivo es la fuente de verdad de **cómo querés que el bot responda** en escenarios concretos. Cada entrada acá se convierte en un few-shot example dentro del system prompt en Fase 3 de [[Bot_Behavior_Methodology]].

## Cómo escribir una conversación ideal

Cada conversación va con esta estructura:

```
### [N] — Título corto del escenario (qué principio prueba)

**Contexto / cliente**: 1-2 líneas describiendo el cliente (formal/informal, qué busca, datos previos).

**Principios que demuestra**: P1 / P2 / P3 / P4 / P5 (los que apliquen).

**Diálogo**:

Cliente: [mensaje del cliente]
Vos:
  mensaje1: [primera bubble — intro/contexto/saludo]
  mensaje2: [fichas o respuesta principal — vacío si no hay fichas]
  mensaje3: [pregunta de cierre o follow-up — vacío si no aplica]

Cliente: [siguiente mensaje]
Vos: ...

**Por qué es ideal**: 1-2 líneas explicando qué hace bien este ejemplo (NO TCO ni listar 6 fichas, etc.). Esto ayuda a que cuando lo lea otra IA o vos en otro momento, entendamos por qué está acá.
```

## Reglas para que sirvan como few-shot

1. **Sé específico con los datos**: usá nombres reales de modelos del inventario (Ford Ranger XLT 2024, Citroën C4 2011, etc.). Precios, km, año concretos. No "auto X tipo Y".
2. **Marcá explícitamente los mensajes vacíos**: si mensaje2 va vacío, escribí `mensaje2: ""` (NO omitas la línea — el LLM aprende que a veces va vacío).
3. **Incluí el formato de fichas exacto**: con emojis 1️⃣ 2️⃣ 3️⃣, 📅 km, 💰 contado, 🔄 permuta, 📝 anticipo. Como espera el sistema actual.
4. **Variá tono**: si tenés un ejemplo formal, también tené uno informal del mismo escenario. Eso ancla el tono espejo (P4).
5. **Casos de borde primero**: las conversaciones más útiles son las que cubren situaciones donde el bot venía fallando (Mustang sin stock, "voy a pensarlo", permuta multi-turn, fotos de auto que no las tenemos cargadas).
6. **Entre 8 y 15 conversaciones es lo ideal**. Más de 20 satura el prompt; menos de 6 no ancla bien.

## Conversaciones (agregá nuevas a medida que aparezcan)

---

### 1 — [Título de tu conversación ideal acá]

**Contexto / cliente**: 

**Principios que demuestra**: 

**Diálogo**:

```
Cliente: 
Vos:
  mensaje1: 
  mensaje2: 
  mensaje3: 
```

**Por qué es ideal**: 

---

