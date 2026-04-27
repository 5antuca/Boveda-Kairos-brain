---
tags: [proyecto, langgraph, metodologia, prompt-engineering, evals, sales-bot]
fecha_inicio: 2026-04-27
estado: Activa — definiendo principios
prioridad: crítica (bloquea iteraciones futuras)
---

# Metodología de comportamiento del bot — del prompt-engineering reactivo al diseño por principios

## Por qué este documento

Durante 2026-04-26/27 se hicieron 8+ iteraciones de prompt en una sola sesión, cada una arreglando un caso particular pero rompiendo o tensionando otros. La conclusión: **prompt engineering reactivo tiene techo**. Cada caso edge nuevo requiere agregar una micro-regla, las reglas se chocan, y el bot termina inconsistente.

La salida es un **enfoque por capas** que la industria usa para AI agents en producción.

## Las 4 capas

### Capa 1 — Principios de conversación
3 a 5 reglas inmutables que definen el contrato del bot. Funcionan como la "constitución" — todo lo demás se deriva de ahí.

Ejemplos del tipo de regla (NO son los principios definitivos, son ilustración):
- "Cualificamos antes de listar. Mostramos máximo N opciones."
- "Nunca pedimos presupuesto en frío. Solo si hay contexto que lo amerita."
- "Cuando no hay stock del segmento pedido, somos honestos: 'no tengo X' antes que inventar alternativas."

### Capa 2 — System prompt limpio
Implementa los principios en ~1500 palabras max. NO acumular micro-reglas para cada caso edge — esas terminan chocando entre sí. La estructura del prompt sigue los principios; las excepciones se manejan con few-shot, no con más reglas.

### Capa 3 — Few-shot examples (la palanca de mayor leverage)
5-10 conversaciones IDEALES inline en el prompt. El LLM (sobre todo gpt-4.1-mini) imita patrones mucho mejor que sigue reglas abstractas. Un ejemplo concreto vale más que diez reglas.

Ejemplo de few-shot que reemplaza una regla abstracta:

```
PRINCIPIO: "no inventar alternativas cuando el segmento pedido no está en stock"

REGLA EN PROMPT (lo que NO funciona solo):
"Si la 2da búsqueda no devuelve un cupé real, decir honesto que no hay."

FEW-SHOT (lo que SÍ funciona):
Cliente: "tienen Mustang en stock?"
Vos:
  mensaje1: "No tengo Mustang ni deportivos similares en stock por ahora."
  mensaje3: "¿Querés que te avise cuando entre algo así, o preferís otro tipo?"
  (mensaje2 vacío — no listar fichas que no matcheen)
```

### Capa 4 — Eval suite (golden conversations)
20-50 conversaciones de prueba con asserts ("debe contener X", "no debe contener Y"). Se corre antes de cada deploy. Catches regresiones automáticamente. Sin esto, cada cambio de prompt es un riesgo ciego.

Trebol legacy n8n tenía 38 checks (`scripts/test_conversation.sh`). El bot Python tiene 23 checks (`scripts/test_bot.sh`). Hay que ampliar a ~50 cubriendo: pickup con/sin budget, deportivo sin stock, utilitario, fotos parcial, handoff total vs parcial, permuta, audio, link ML, multi-turno, etc.

## Datasets de concesionarias — qué existe y qué no

- **No hay datasets públicos** de conversaciones de WhatsApp de concesionarias que vendan bien. Las marcas grandes (Stellantis, Toyota AR, etc.) tienen sus datos privados.
- **MultiWOZ** y similares son para hoteles/restaurantes, no autos.
- **El path realista**: récord-and-imitate. Conversaciones reales con resultado positivo se transforman en few-shot examples. Eventualmente, fine-tuning sobre 50-200 ejemplos curados.

## Roadmap — Implementación por fases

### Fase 1 — Definir principios (sesión actual)
Conversación dirigida con el usuario. 5-7 preguntas con opciones concretas. Output: 5 principios firmes.

### Fase 2 — Reescritura del system prompt desde cero
Basado en los principios. Más corto que el actual (~1500 palabras vs 3000+). Sin micro-reglas acumuladas.

### Fase 3 — Few-shot examples curados
8-10 conversaciones IDEALES escritas a 4 manos (vos defines escenarios + redacción correcta, yo armo el JSON formato). Inyectados al final del prompt.

### Fase 4 — Eval suite ampliado
~50 escenarios en `scripts/test_bot.sh` (o un nuevo runner). Cada caso edge que aparezca en el futuro se agrega ahí PRIMERO y después se ajusta prompt.

### Fase 5 — Workflow de iteración
Cambio de prompt → corre suite → si pasa, deploy a test → si falla, vuelta atrás. NO más probar a ojo por WhatsApp como método primario.

### Fase 6 (futuro) — Fine-tuning
Con 50-200 conversaciones reales curadas, fine-tunear gpt-4.1-mini para internalizar el estilo. Costo: ~$5-30 por entrenamiento. Resultado: prompt corto + comportamiento consistente sin tantos ejemplos.

## Tooling útil (orientativo)

- **Langfuse** (ya integrado): trace analysis, identificar conversaciones malas en producción.
- **PromptHub / Helicone**: versionado de prompts (a futuro).
- **OpenAI evals** o framework custom Python: comparación bot output vs expected.
- **Ragas / DeepEval**: métricas automáticas (relevancia, fidelidad, toxicidad).

## Esta metodología aplica a multi-tenant FangioCRM

Cuando se haga la migración a tenant-aware (ver [[../Fangio_CRM/Bot_LangGraph_Migration]]), los principios son globales (todos los tenants los heredan), el prompt template incluye los principios + slots para personalización por tenant, los few-shot pueden tener variantes por tenant (algunos prefieren tono más formal, otros más cómplice), y el eval suite tiene runs separados per-tenant + un suite común.

## Links

- [[Supreme_Sales_Swarm]] — F1/F3 implementados, F4 esperando
- [[../Fangio_CRM/Bot_LangGraph_Migration]] — multi-tenant pendiente
- [[../../infra/Roadmap]] — roadmap general
