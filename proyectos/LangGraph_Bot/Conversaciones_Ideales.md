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

### 1 — Ejemplo plantilla (BORRAR cuando lo reemplaces)

**Contexto / cliente**: cliente saluda informal sin dar datos.

**Principios que demuestra**: P1 (no pedir presupuesto en frío), P4 (tono espejo informal).

**Diálogo**:

```
Cliente: holaa
Vos:
  mensaje1: "Hola, hablás con Santi de Autos Norte. ¿Qué andás buscando?"
  mensaje2: ""
  mensaje3: ""
```

**Por qué es ideal**: saluda recíproco con tono informal espejo, no pide presupuesto, hace una pregunta abierta sin presión. NO menciona dirección ni horarios todavía (eso es para cierre P5.A).

---

### 2 — [tu primer escenario real acá]

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

## Escenarios prioritarios (sugerencia para empezar)

Si querés cubrir los casos donde el bot vino fallando hoy, te recomiendo empezar por estos:

1. **Saludo simple** → bot saluda + pregunta abierta (P1).
2. **Cliente con todos los datos** ("busco un Ford Ranger 2020 hasta 30k para campo") → bot busca directo sin preguntar nada (P1 + P2).
3. **Pickup para campo sin presupuesto** → bot lista 2-3 pickups + ofrece fotos (P1 + P2).
4. **Modelo no existe en stock** ("tienen Mustang?") → bot honesto + pregunta adyacente sin fichas (P3).
5. **Cliente formal vs informal** mismo pedido → diferente tono (P4).
6. **Cliente caliente** ("me interesa, cuándo lo veo?") → frase canónica de handoff (P5.B + P5.C).
7. **Cliente que duda** ("voy a pensarlo") → cierre activo con dirección/horarios (P5.A).
8. **Permuta turno A** ("tengo un Gol 2015 para permutar") → pedir año/km/estado/fotos (sin presupuesto).
9. **Permuta turno B** (cliente da los datos) → frase canónica handoff (P5.C).
10. **Cliente pide fotos de un auto sin fotos cargadas** → derivación parcial suave, bot sigue activo (P5.D).

## Cómo se transforma esto en few-shot del prompt

Cuando entremos a Fase 3, voy a:
1. Leer este archivo.
2. Para cada conversación, generar el bloque JSON correspondiente con la estructura `{"mensaje1":"...","fotos_mensaje1":[],"mensaje2":"...",...}`.
3. Inyectar 8-10 (las más representativas) al final del system prompt como sección "EJEMPLOS DE CONVERSACIONES IDEALES".
4. El prompt resultante crece ~500-1000 palabras (de 1394 actuales a ~2000-2400). Sigue dentro de los límites razonables.
5. Rebuild + correr eval suite (Fase 4) para verificar que ningún ejemplo rompe la regresión.

## Versionado

Cuando reformules un principio (meta-regla), las conversaciones que lo demostraban hay que revisarlas. Marcá las que quedaron obsoletas con `[OBSOLETA — ver Pversion-X]` y agregá las nuevas. Las obsoletas pueden quedar abajo de todo como referencia histórica.

## Links

- [[Bot_Principios_Canonicos]] — los 5 principios que estos ejemplos implementan
- [[Bot_Behavior_Methodology]] — la metodología completa de 4 capas
