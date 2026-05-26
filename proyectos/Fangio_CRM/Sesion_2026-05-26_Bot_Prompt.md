---
tags: [fangiocrm, fangiobot, bot, prompt, langgraph, handoff]
fecha: 2026-05-26
relacionado: [[FangioBot]], [[Sesion_2026-05-26_Chat_UI]], [[feedback_derivador_conversation_rules]]
---

# Sesión 2026-05-26 — Pulido del bot (prompt) + plan A→B→C

> ⚠️ Handoff: la sesión se cortó por contexto (97%). Esto deja el estado para retomar.

Bot = LangGraph Python (`bot-service/`), prompt `configs/prompts/trebol.txt`, rama `bot-rollback-2026-04-18`. Single-tenant (rollback) sirviendo gerstner. Prompt BAKED en la imagen → cambios requieren **rebuild** (`cd environments/test/trebol && docker compose build trebol-test-bot && docker compose up -d --no-deps --force-recreate trebol-test-bot`). Regresión: `bash scripts/test_bot.sh all` (objetivo 35/35). Post-deploy: `bash scripts/clear-chat-memory.sh 5491150635028`. Verificar deploy del bot = es el container local, no Vercel.

## Decisión madre (del usuario)
El prompt se hizo gigante (~455 líneas) → a partir de cierto punto **alucina**. Para seguir mejorando al agente **sin** inflar el prompt, plan escalonado: **A (comprimir) → B (reglas mecánicas a código) → C (fine-tune)**. **D (modelo más fuerte, gpt-4.1 full) descartado por ahora** (costo). Regla de oro de acá en más: en vez de sumar líneas al prompt, sumar guardas en Python.

## ✅ A — Comprimir el prompt (HECHO)
`trebol.txt` **455 → 167 líneas** (−63%), mismo comportamiento. Commit `499dd6b` (rama pusheada), live, **test_bot.sh 35/35**. Checkpoint previo `aba92d2` (+ backup local `trebol.txt.bak-2026-05-26-pre-compress`, gitignored). Qué se hizo: consolidar duplicados (recomendar-por-tipo, no-editorializar, reglas de fotos), resolver la contradicción ficha-emoji vs hablado (se alineó TODO a hablado; fuera ejemplos A/B con 1️⃣📅💰), recortar ejemplos verbosos. Frases scriptadas (CASOS 1/2/3, handoff, primer turno), `{ESTADO_CALIFICACION}`, `{NOMBRE_AGENCIA}`, formato JSON: intactos. Sacado "¿cuál te interesa?" como cierre (queda solo en prohibiciones).

También en este bloque (ya commiteado `aba92d2`): regla **">3 resultados del mismo modelo/tipo → CUALIFICAR** (0km/usado/presupuesto/año) en vez de dumpear la lista". Verificado live (Hilux → "¿Buscás 0km o usada?"). El assert H1 de test_bot.sh se actualizó para aceptar listar-O-cualificar.

## ✅ B — Reglas mecánicas a código (HECHO — commit `d147d9e`)
Hook: `_parse_agent_response()` en `bot-service/trebol_bot/agent/graph.py` (ya parsea el JSON mensajeN/fotos_mensajeN y ya dedupea "¡Hola!" determinístico). Ahí van las guardas.

**Decisiones del usuario (2026-05-26):**
- **Acción ante frase prohibida detectada = SOLO LOGGEAR/ALERTAR** (no strip silencioso, no regenerar). O sea: detectar + registrar la violación para medir, sin alterar el output al cliente.
- **Alcance de esta tanda = (1) filtro de frases prohibidas + (2) anti-alucinación de precios/URLs.** NO se hace voseo auto-replace (riesgoso, queda en prompt) ni el ">3→cualificar determinístico" (queda en prompt por ahora).

**A implementar (próxima sesión):**
1. **Detector de frases prohibidas** (log-only): en `_parse_agent_response`, detectar en el output frases como "¿cuál te interesa?", muletillas de apertura ("Perfecto,"/"Buenísimo,"/"Dale,"/"Genial,"), y formas de "tú" (tienes/puedes/dime…) → loggear la violación (structlog + quizás tabla tipo `llm_drift_events`). NO alterar el mensaje.
2. **Anti-alucinación precios/URLs** (log-only por ahora, dado que la acción es loggear): validar que cada `U$S <n>` y cada URL de foto del output haya salido de la última respuesta de `buscar_inventario_autos` de ESE turno; si el LLM inventó un número/URL → loggear (base: el detector de drift de USD F3 existente, `llm_drift_events` en Postgres test, `scripts/apply_f3_drift_detector.py`).
- Una vez con telemetría, decidir si se sube de "log" a "strip/regenerar".

**✅ Implementado 2026-05-26 (commit `d147d9e`, junto al refactor CRM-inline de `prompts.py`):**
- `_audit_output()` en `graph.py` audita el output final SIN alterarlo y loggea `guard_frase_prohibida` / `guard_precio_no_respaldado` / `guard_url_no_respaldada`.
- `_GUARD_PHRASES`: "¿cuál te interesa?", muletillas de apertura ("Perfecto,"/"Buenísimo,"/"Dale,"/"Genial,"/"Bárbaro,"), formas de "tú" (tienes/puedes/dime…). **Ojo calibración**: "tu/tus" posesivo es voseo VÁLIDO → NO se flaguea (solo "tú" con acento + conjugaciones).
- Anti-alucinación: la fuente de respaldo es TODA la conversación previa (`result["messages"][:-1]`), no solo el turno actual → un precio/URL reusado de la "ficha ya mostrada" no es falso positivo.
- Verificado: las guardas disparan (probado con "tu") y `test_bot.sh` queda 35/35 (no alteran el output). Falsos positivos corregidos en el camino.

## 🧪 Escribir los tests (golden conversations → test_bot.sh) — EN CURSO 2026-05-26

**Decisión del usuario**: para seguir mejorando el bot, escribir las conversaciones modelo y derivar los asserts de ahí. La conversación es la **fuente de verdad**; `scripts/test_bot.sh` pasa a ser un derivado.

- `docs/ConverBuenas.md` (repo principal, NO el vault) — cómo DEBE responder el bot hoy.
- `docs/ConverMalas.md` — errores a no repetir.
- Derivación: Claude **infiere** los asserts de la prosa (no tags explícitos) y los muestra para aprobar. Asserts de **comportamiento, no valores exactos** (el inventario de hoy es gerstner/"Autos Norte", no el Trébol viejo de los docs) → así el drift de stock no rompe el test.
- **Estado**: `ConverBuenas.md` reescrito desde cero (2026-05-26) con 14 situaciones-plantilla vacías (CB-01..14, agrupadas, con `Situación`/`Qué prueba`). Se descartó todo el contenido n8n viejo (fichas emoji, catálogo ML); solo se conservaron las *situaciones*. **Pendiente**: el usuario rellena los diálogos `Cliente:`/`Bot:` → me dice "regenerá" → reescribo `test_bot.sh`. `ConverMalas.md` sigue en formato viejo, reescribir igual.
- Situaciones core (10): búsqueda c/presupuesto, no-sabe-qué-quiere, >3 resultados→cualificar, sin-stock+alternativa, permuta, señal-presupuesto-sin-número, simulación cuotas, objeción de precio, pide fotos, cierre/"lo pienso". Extra (4): anotar pedido, financiación, fuera de alcance, tono espejo+ráfaga.

## ⏳ C — Fine-tune (PENDIENTE)
Objetivo de fondo: bakear el comportamiento en los pesos → prompt corto y consistente. Plan + dataset semilla (11 arquetipos) en `specs/2026-05-25-finetune-plan-derivador.md` + `bot-service/finetune/`. Pausado; retomar después de B.

## 🖼️ Pendiente aparte (charlado, NO decidido) — carga de imágenes
El usuario quiere que el agente **SIEMPRE mande fotos al recomendar**, con el **texto descriptivo como caption de la imagen** (ej: "Tenemos esta Ford Ranger 2022 con 150.000km a U$S 90.000 al contado, financiable en 12 cuotas"). Bloqueante: **cómo cargar fotos cómodo para un vendedor NO técnico**. Opciones planteadas:
- **(Recomendada) Subir fotos en la grilla del inventario (drag&drop)** → hosting (Vercel Blob / R2) → URL por auto en gridState → el bot las manda. Cero conocimiento técnico.
- Columna "Fotos" con links en el Excel (bot baja la URL → media). Power-user/ML; el público no se da maña.
- Híbrido.
Además: poner el caption en la imagen requiere cambio de CÓDIGO en el envío (Evolution `sendMedia` soporta `caption`; hoy el bot manda fotos en `fotos_mensajeN` separadas del texto). Hoy solo 7/54 autos de gerstner tienen fotos.

Ver memoria [[reference_fangiobot_chat_ui]] (chat UI, sin relación directa pero mismo producto) y [[reference_bot_rebuild_required]].
