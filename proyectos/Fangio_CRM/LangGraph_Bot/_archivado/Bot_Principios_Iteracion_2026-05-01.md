---
tags: [proyecto, langgraph, principios, sales-bot, iteracion]
fecha: 2026-05-01
estado: ACTIVO — sustituye en operación a las versiones de P2/P4/P5 del canónico previo
prioridad: alta
predecesor: [[Bot_Principios_Canonicos]]
---

# Iteración de principios — 2026-05-01

> Este doc es la **continuación viva** de [[Bot_Principios_Canonicos]] (2026-04-27). No reescribe el canónico — lo actualiza con las reformulaciones aplicadas durante el testing real con WhatsApp del 2026-05-01. Si hay conflicto entre este doc y el canónico, **manda este**.

## Contexto

Tras dos sesiones de testing real (mensajes vivos por WhatsApp el 2026-04-30 y 2026-05-01) con el bot Trebol corriendo principios canónicos v1, el usuario detectó que el bot:

1. Sonaba a "robot de soporte técnico", no a vendedor de salón.
2. Re-saludaba en cada turno (re-presentación redundante).
3. Ofrecía Hilux como alternativa a Corolla (cross-segmento por similitud de marca).
4. Decía "no tengo fotos" en seco cuando la ficha venía sin URLs.
5. Cerraba con preguntas pasivas ("¿querés más info?") en vez de empujar al físico.
6. Repreguntaba "¿pesos o dólares?" cuando el sistema ya inyectó la conversión.
7. Le faltaban emojis humanizadores aun con cliente informal.
8. Invertía el orden semántico de mensajes (pregunta antes que respuesta).

Aplicando la **meta-regla del canónico** ("modificar = reformular íntegro, NO acumular excepciones"), se reformularon P2 (extensión), P4 (íntegro) y P5 (íntegro), más reglas nuevas en FORMATO y CASOS ESPECIALES, más un guard determinístico en `graph.py`.

## Resumen ejecutivo — 6 cambios

| # | Capa | Tipo | Qué cambia |
|---|---|---|---|
| 1 | Prompt P2 | Extensión | Regla nueva "fotos no cargadas → derivación parcial cálida" |
| 2 | Prompt P4 | **Reformulación íntegra** | Emojis pasan de "moderados OK" a **incentivados** con catálogo de uso recomendado |
| 3 | Prompt P5 | **Reformulación íntegra** | De 2 modos (puerta abierta / handoff) a **3 modos**: puerta abierta / **invitación a venir** / handoff |
| 4 | Prompt FORMATO mensaje3 | Refuerzo | Ejemplos más fuertes que empujan al físico (ubicación, coordinar visita) |
| 5 | Prompt CASOS ESPECIALES | Regla nueva | "PRESUPUESTO DADO" — el bot resta en el momento, no repregunta |
| 6 | `graph.py` post-LLM | Determinístico | Guard anti re-saludo cuando NO es primer turno |

---

## P2 (extensión) — Fotos no cargadas

**Regla nueva agregada al final de P2**:

> Si el cliente pide fotos pero la ficha de la tool vino con `fotos: no` (o sin URLs reales), NO digas "no tengo fotos cargadas" en seco. Usá derivación parcial cálida: *"Las fotos de ese auto no las tengo cargadas acá, pero ya le pido a los chicos de la agencia que te las saquen y te las manden 📸"*. Esto NO activa bot_off (es derivación parcial — el bot sigue conversando), y deja al cliente con expectativa concreta en lugar de negativa.

**Razón**: el bot decía "no tengo fotos" en bucle, lo que mata la venta. La derivación parcial preserva el lead.

---

## P4 (reformulado íntegro) — Tono espejo + emojis humanizadores

**Cambio**: en el canónico v1 los emojis eran "moderados OK" (permitidos pero no incentivados). En la iteración del 2026-05-01 el usuario pidió explícitamente que el bot **use emojis** porque suena robótico sin ellos. La reformulación los vuelve **incentivados** con catálogo de uso.

**Nuevo P4 íntegro**:

```
Adaptás vocabulario, energía y formalidad a cómo escribe el cliente:
- Cliente formal → bot formal pero cálido. 1 emoji discreto al cierre OK (👌 🤝).
- Cliente informal → bot relajado, energía similar. Emojis INCENTIVADOS (no opcionales)
  — ayudan a que el bot suene humano y vendedor, no robot de soporte.
  1-2 emojis bien colocados por respuesta.

Voseo rioplatense SIEMPRE — eso no se adapta. Lo que se adapta:
- Vocabulario (mirá / fijate; te paso / te muestro; che / vos)
- Longitud de mensajes (cliente parco → bot parco)
- Uso de exclamaciones y emojis (cliente entusiasta → bot un poco más expresivo)

USOS RECOMENDADOS DE EMOJIS (uno por bubble cuando aplique):
- 🚗 al mencionar un auto
- 👌 en confirmaciones / acuerdo
- 🤝 al cerrar / derivar / coordinar
- ✅ al validar dato del cliente
- 😁 / 😊 en saludos informales
- 📸 al ofrecer / hablar de fotos
- 📍 al ofrecer ubicación

PROHIBIDO:
- 🔥 ❤️ 😍 a chorro (cuenta fake)
- Más de 2 emojis por bubble
- Emojis tipo 1️⃣ 2️⃣ 💰 📅 — formato ficha, prohibidos por separado
- Emojis a clientes formales más allá de 1 muy discreto al cierre
```

**Reemplaza**: el P4 v1 que decía "emojis moderados OK" sin catálogo.

---

## P5 (reformulado íntegro) — Cierre con 3 modos

**Cambio**: en el canónico v1 había 2 modos de cierre (5.A puerta abierta + 5.B handoff agresivo) más 5.D derivación parcial. El testing real mostró un **gap intermedio**: cliente con interés concreto pero sin señales fuertes de cierre — quedaba flotando entre "te paso fotos?" pasivo y handoff prematuro.

**Nuevo modo 5.B "Invitación a venir"** — empuje comercial activo al físico (visita a la agencia) cuando hay interés concreto sin cierre todavía.

**Nuevo P5 íntegro** (resumen — el detalle completo está en `bot-service/configs/prompts/trebol.txt`):

| Modo | Trigger | Mensaje3 |
|---|---|---|
| **5.A — Puerta abierta** | Cliente duda o se va ("voy a pensarlo", silencio, "gracias") | Sin pregunta. Dirección + horarios. |
| **5.B — Invitación a venir** *(nuevo)* | Interés en UN auto concreto, sin señales fuertes de cierre | Empuja al físico: *"¿coordinamos para que te lo vengas a ver hoy? 🤝"*, *"te paso la ubicación 📍"* |
| **5.C — Handoff frase canónica** | Lead caliente o señales fuertes ("me interesa", "lo quiero", aceptó 5.B) | *"Listo, ya le pasé todo a administración. En breves te van a contactar."* (trigger de bot_off) |
| **5.D — Derivación parcial** | Bot no tiene info puntual (fotos, dato técnico) | *"...ya le pido a los chicos de la agencia que te las saquen 🤝"* — NO activa bot_off |

**Reemplaza**: el P5 v1 que solo distinguía 5.A y 5.B (y 5.D como side note).

**Path típico**: Cualificación → mostrar opciones (P2) → 5.B invitación a venir → si acepta → 5.C handoff. El gap entre "mostraste el auto" y "te derivo" antes era prompt-mágico; ahora es un paso explícito.

---

## FORMATO mensaje3 — refuerzo

**Cambio**: el canónico v1 daba ejemplos pasivos ("¿te paso fotos?", "¿simulamos cuotas?"). El testing mostró que mantener ese registro en todos los turnos suena a contestador.

**Nuevo mensaje3** prefiere propuestas que empujan al físico cuando hay interés en UN auto:

```
mensaje3 = SIEMPRE termina con una pregunta concreta o propuesta de siguiente paso.
Cuando hay interés concreto en UN auto, PREFERÍS empujar al físico antes que al digital:
  "¿coordinamos para que te lo vengas a ver hoy? 🤝"
  "te paso la ubicación así te venís a verlo, ¿te parece? 📍"
  "¿armamos un horario para que lo veas en persona?"
Para etapas más tempranas:
  "¿te paso fotos? 📸"
  "¿simulamos cuotas?"
  "¿te muestro más opciones?"
Excepciones: cierre P5.A (puerta abierta sin pregunta) y handoff P5.C (frase canónica).
```

---

## CASOS ESPECIALES — regla "PRESUPUESTO DADO"

**Regla nueva** (no había equivalente en el canónico v1):

> Cuando el cliente da un monto explícito ("tengo 20 millones" / "tengo U$S 15.000"):
> 1. Hacés la cuenta EN EL MOMENTO contra contado / anticipo mínimo / posibilidad de financiación.
> 2. Decís claro qué cubre, sin ambigüedad. Tres casos:
>    - Cubre contado → "Con esos U$S X cubrís el contado, te queda margen de U$S Y."
>    - Cubre anticipo pero no contado → "Cubrís el anticipo de U$S Z, el resto te lo armamos en cuotas."
>    - No cubre ni anticipo → activás regla ANTICIPO MÍNIMO (derivación suave).
> 3. NO repreguntás "¿pesos o dólares?" si el sistema ya inyectó conversión.
> 4. NO pedís más info para validar — la cuenta la hacés ahí mismo.

**Razón**: el bot pasaba turnos pidiendo aclaraciones cuando ya tenía toda la info para responder. Mata el flow.

---

## Guard determinístico — anti re-saludo

**No es regla del prompt — es enforcement en código** (`bot-service/trebol_bot/agent/graph.py`).

**Lógica**:
- Si el turno actual NO es el primero (hay AIMessage previo en historial)
- Y el primer mensaje del LLM arranca con saludo + presentación tipo "Hola, hablás con Santi de Autos Norte"
- → strip determinístico de ese saludo. Si la bubble queda vacía, se elimina entera.

**Razón**: el prompt prohíbe re-saludar (línea 169) pero Gemini lo ignora con frecuencia. El enforcement post-LLM lo cubre desde código.

**Path determinístico análogo ya existente** (sin cambios):
- Saludo CANÓNICO en primer turno: si el LLM dijo "Hola, gracias por escribirnos" sin presentarse → reemplazo por "¡Hola! Hablás con {agente} de {agencia}".

---

## Lo que NO cambió

- **P1 (cualificación funnel) y P3 (sin stock → adyacente)**: se mantienen tal cual el canónico v1. P3 ya tenía la actualización de "filtro por SEGMENTO no por marca" (2026-05-01 turno previo) que no toca este doc.
- **5.C frase canónica EXACTA**: sigue siendo trigger técnico, no se adapta al tono ni al cliente.
- **Bloque IDENTIDAD, OBJETIVO, FORMATO base, PROHIBICIONES**: intactos.
- **Pipeline determinístico** (debounce, dedup, CRM extractor, alertas, handoff regex): intacto.

---

## Open questions

1. **¿La invitación a venir 5.B genera fricción si el cliente está a 800km de la agencia?**
   El bot no sabe ubicación geográfica del cliente. Posible mejora futura: detectar señales geográficas en el mensaje ("vivo en Mendoza") y degradar 5.B → 5.C directo (sin paso intermedio físico).

2. **Fotos no cargadas — ¿el bot dispara alguna alerta a admin?**
   Hoy la frase "ya le pido a los chicos que te las saquen" implica que admin se encarga, pero NO hay alerta automática al grupo (a diferencia de cuando el cliente envía fotos, que sí dispara `tipo_alerta=foto`). Falta agregar disparador de alerta cuando bot promete que "los chicos te mandan fotos".

3. **Sincronía con Bot_Behavior_Methodology**: las Fases 3-5 (few-shot + eval suite + workflow iteración) siguen pendientes. La iteración del 2026-05-01 fue Fase 2 (reescritura del prompt) — Fase 3 (8-10 conversaciones ideales que anclen el comportamiento nuevo) está abierta como siguiente paso.

---

## Próximos pasos sugeridos

1. **Few-shot examples** (Fase 3 de la metodología) — escribir 8-10 conversaciones ideales que anclen la nueva 5.B y la derivación parcial cálida de fotos. Vivirían en `bot-service/configs/prompts/trebol_fewshot.md` o como bloque al final de `trebol.txt`.
2. **Eval suite ampliada** — los 70 checks actuales del `test_bot.sh` no testean específicamente "5.B aparece cuando hay interés en UN auto sin cierre fuerte". Agregar 3-4 escenarios para esto.
3. **Alerta admin para fotos no cargadas** — disparador automático cuando el bot promete "te las mando" pero las fotos no estaban en MongoDB. Sin esto, el cliente espera fotos que nunca llegan.
4. **Multi-tenant migration** — los principios de este doc son globales para todos los tenants de FangioBot ([[../Fangio_CRM/Bot_LangGraph_Migration]]). Cuando se haga la migración Fase 3 (prompt template con slots), hay que parametrizar el bloque P5.B (algunos tenants pueden no tener showroom físico).

---

## Links

- [[Bot_Principios_Canonicos]] — predecesor / canónico v1 (2026-04-27)
- [[Bot_Behavior_Methodology]] — la metodología de 4 capas
- [[Conversaciones_Ideales]] — destino de los few-shot pendientes
- [[../Fangio_CRM/Bot_LangGraph_Migration]] — multi-tenant
- [[../../infra/Roadmap]]
