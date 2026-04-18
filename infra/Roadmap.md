# Roadmap y Mejoras Activas - Kairos-infra

## 🚀 Cutover bot Python a PROD (2026-04-18) ✅

Fase final de la migración bot n8n → Python LangGraph. `trebol-prod-bot` procesa todos los mensajes del inbox `trebolllllllll` (account 4, inbox 5). El workflow n8n `Trebol v4 Test` (ID `wf4ts1WKcpOaE90A__FkD`) quedó desactivado.

- [x] Config `configs/trebol-prod.yaml` (`client_id=trebol-prod`, inbox 5, sheets prod)
- [x] Service `trebol-prod-bot` en `environments/production/trebol/docker-compose.yml`
- [x] DNS `trebol.bot.kairosaisolutions.com` → 46.62.235.162 (Hetzner)
- [x] Traefik + Let's Encrypt SSL válido
- [x] `extra_hosts` en 5 containers (n8n, worker, chatwoot-web, sidekiq, evolution) apuntando a `172.18.0.100` — fix NXDOMAIN cache Ruby
- [x] Webhook Chatwoot ID 2 → `https://trebol.bot.kairosaisolutions.com/webhook/chatwoot`
- [x] Workflow n8n viejo desactivado en Postgres
- [x] Langfuse emitiendo traces con tags `env:prod`, `trebol-prod`, session `{phone}`
- [x] Incidente Hugo Benitez (conv 368) resuelto y respuesta enviada via Evolution
- [x] Documentación: [[Prod_Deploy]], [[Operar_Bot]] actualizado, [[Trebol_Prod_Architecture]] actualizado

**Pendiente post-cutover**:
- Monitoreo continuo los primeros días (logs bot + Langfuse + CRM Sheets)
- Revisar alertas que lleguen al grupo `Alertas Trebol` (`120363404968281666@g.us`)
- Evaluar si se elimina el workflow viejo de n8n después de 1-2 semanas estables

---

## 🧠 Context Engineering — Bóveda Obsidian (2026-04-13)

**Objetivo**: unificar todo el contexto en la bóveda Obsidian `Kairos_Brain/`. `.claude/context/` queda deprecado. La bóveda es portable, RAG-friendly, editable desde Obsidian/cualquier IA.

**Backup branch**: `backup/pre-obsidian-migration` en commit `7e46dee` (push hecho a origin para rollback).

- [x] **Construcción de Bóveda Principal**: Arquitectura de base de datos de conocimiento migrada hacia un Zettelkasten local con Obsidian en `Kairos_Brain/`.
- [x] **Volcado de Memoria Implícita**: Se extrajo conocimiento implícito del IA Agent y se organizó en carpetas estructuradas (`infra/`, `contexto-claude/`, `proyectos/`).
- [x] **Integración Total (Opción B)**: Se movieron los 9 archivos pesados de `.claude/context` a la bóveda (roadmap, architecture, manifesto, etc.).
- [x] **RAG Nativo para Claude**: `CLAUDE.md` e `Instrucciones Generales.md` apuntan estrictamente al vault como única fuente de verdad técnica.
- [x] **Comandos reapuntados**: `/prime-v4`, `/diagnose`, `/new-spec`, `/deploy`, `/prime-debug`, `/prime` ahora cargan archivos desde `Kairos_Brain/`.

**Mapping de archivos** (`git mv` de `.claude/context/*` → `Kairos_Brain/...`):

| Origen | Destino |
|---|---|
| `architecture.md` | `Kairos_Brain/contexto-claude/Architecture_Index.md` |
| `VPSarchitecture.md` | `Kairos_Brain/infra/VPS_Architecture.md` |
| `system_map.md` | `Kairos_Brain/infra/System_Map.md` |
| `engineering_manifesto.md` | `Kairos_Brain/contexto-claude/Engineering_Manifesto.md` |
| `rules_n8n.md` | `Kairos_Brain/contexto-claude/Rules_n8n.md` |
| `roadmap.md` | `Kairos_Brain/Roadmap.md` |
| `TREBOLarchitecture.md` | `Kairos_Brain/proyectos/Trebol/Trebol_Prod_Architecture.md` |
| `trebol_workflow.md` | `Kairos_Brain/proyectos/Trebol/Workflow_v4_Reference.md` |
| `testing.md` | `Kairos_Brain/proyectos/Trebol/Testing_Harness.md` |

**Constraint**: NO tocar `workflows/trebol_v4_test.json` ni `workflows/alertasvendedores_test.json` — tienen el fix bot-off Fase 5 sin smoke test todavía (stash protegido).

**Rollback**: `git reset --hard backup/pre-obsidian-migration` si algo sale mal.

---

## Bug Fix — Filtro presupuesto post-RAG + GPT-4.1-mini drift (2026-04-16 sesión 2)

### Root cause sistémico identificado
**GPT-4.1-mini no puede confiarse para aplicar reglas de precio o decidir cuándo buscar.** Incluso con prohibiciones explícitas en el system prompt, el modelo las ignora cuando tiene un intent opuesto fuerte (ej: "busco un auto"). La arquitectura correcta es mover todas las decisiones de precio y flujo al nivel determinístico (Code nodes, MongoDB pipelines, guardias).

### Bugs corregidos (2026-04-16)
- [x] `postFilterPipeline` devolvía JS array en lugar de JSON string → `NodeOperationError: No JSON string provided`. Fix: `return ""` / `return JSON.stringify([...])`
- [x] `esPosibleNombre` regex: `\1` backreference se serializaba como `\x01` (byte SOH) en JSON → nunca matcheaba. Fix: usar `\1` explícito en Python string
- [x] `guardiaUsoActiva` — nueva guardia determinística: cuando hay presupuesto + nombre pero no uso → pregunta "¿Para qué lo vas a usar?" antes de buscar, bypaseando el AI Agent

### Bugs pendientes (2026-04-16)
- [ ] **Bug D** — `msg_count=0` en T2 post-guardia: cuando T1 pasa por guardia, el T2 siguiente tiene `esPrimerMensaje=true` → saludo duplicado "¡Hola!". Investigar `Guardia Save Chat` (continueOnFail, timing relativo a Check Primer Mensaje)
- [ ] **Option B** — Filtro post-RAG en Code node: segunda capa de filtrado de precio DESPUÉS de que el RAG devuelve resultados, ANTES de que el AI Agent los vea. Determinístico, no depende del LLM. Ver spec: `specs/2026-04-16-filtro-presupuesto-post-rag.md`

### Estado deploy
- [x] Fixes A/B/C en `workflows/trebol_v4_test.json`
- [ ] Fix Bug D (Guardia Save Chat + msg_count)
- [ ] Implementar Option B (post-RAG filter)
- [ ] Deploy a PROD (bloqueado hasta test aprobado)

---

## Bug Fix — Conversión de pesos + links MercadoLibre (2026-04-16)

### Root cause identificado
Dos bugs encadenados en el nodo `Inyectar Conversión Pesos` de Trebol v4:

1. **Bug A (crítico)**: Pattern 3 `(\d{7,})` capturaba el ID del listing de ML (`MLA-1694594131`) como un monto de ~1.694 millones de pesos → el LLM recibía presupuesto falso de U$S 1.2M → mostraba autos populares/caros, ignorando los baratos. Afecta a todos los leads que llegan por ML.

2. **Bug B (menor)**: Se usaba `value_sell` (tasa de venta del blue, la más alta) para convertir pesos a USD. Con tasa sell 1410: 7M pesos = 4.965 USD → auto a U$S 5.000 excluido. Con mid-rate 1400: 7M = 5.000 USD → incluido.

### Fix aplicado (2026-04-16, TEST)
- Agregar `mensajeSinUrls = mensaje.replace(/https?:\/\/[^\s]+/gi, '')` antes de los patterns
- Aplicar patterns sobre `mensajeSinUrls` en vez de `mensaje`
- Cambiar dolarBlue: `value_sell` → `(value_sell + value_buy) / 2`

**Verificado:**
- Link ML `MLA-1694594131` → sin conversión (antes: `$1694.6M ≈ U$S 1.212.156`)
- "7 millones" a tasa 1400 → `U$S 5.000` exacto (antes: `U$S 4.965` con sell 1410)
- "U$S 5000" sin pesos → sin conversión (correcto, sin regresión)

Ver postmortem completo: `proyectos/Trebol/bugs/2026-04-16-conversion-pesos-ml-ids.md`

### Estado deploy
- [x] Fix en `workflows/trebol_v4_test.json` — nodo `Inyectar Conversión Pesos`
- [ ] Importar a n8n test y validar con conversación real (link ML + monto pesos)
- [ ] Deploy a PROD `wf4ts1WKcpOaE90A__FkD` (hotfix, no requiere spec)
- [ ] Limpiar memoria post-deploy: `bash scripts/clear-chat-memory.sh 5491150635028`

---

## Bot de Ventas — trebol22

### ✅ Completado (TEST + PROD)
- [x] **Guardrail Anti-Alucinación** (2026-02-24/25): Regla de oro en system prompt. Obliga a llamar `buscar_inventario_autos` antes de mencionar cualquier vehículo. Deployado en TEST y PROD.
- [x] **Phase 1 — Dynamic State Block** (2026-02-23/24): Nodo `Construir Estado CRM` entre Switch1(out3) y AI Agent. Estado dinámico del CRM reemplaza CAMINO DE CALIFICACIÓN estático. Deployado en TEST y PROD.
- [x] **Fix catalogo_ml_financiacion** (2026-02-23): Switch1 out7 → Edit Fields7 → AI Agent. Bot responde vehículo + financiación en el mismo mensaje.
- [x] **Nombre antes de derivar**: Regla en system prompt — pedir nombre antes de confirmar cualquier handoff.
- [x] **Normalizar Payload**: Nodo Code al inicio del flow. Resuelve case sensitivity del webhook Chatwoot.
- [x] **Detectar Vendedor**: Guard que evita que mensajes de vendedores activen el bot.

### ✅ Completado (TEST)
- [x] **V4-V7 actualprod fixes** (2026-03-01): Debounce simplificado, Init Loop 1 iter, dedup fotos, PRESUPUESTO estricto, auto-response dead-end fix. Pendiente deploy a prod.
- [x] **V5 System prompt fixes** (2026-03-01): Prioridad de respuesta, distinción búsqueda vs permuta, calificación CRM como guía.
- [x] **Trebol v3 — Rediseño Completo** (2026-03-03): Workflow nuevo de 50 nodos (vs 131). Estado de conversación en Redis, clasificador contextual, 1 Code node reemplaza 6 Edit Fields, parseo JSON sin LLM Chain, loop de envío unificado, error handling en todas las rutas. Archivo: `workflows/trebol_v3_test.json`. (v3 dejó de mantenerse — ver [[Workflow_v4_Reference]])
- [x] **Tool Simulador Cuotas fixes** (2026-03-03): [12]→[3,6,12], monto<3000→[3,6], guard contadoValor=0, anticipo_sugerido, onError Dolar Blue, coma-miles fix. Archivo: `workflows/tool_simulador_cuotas_test.json`.

### ⚠️ En corrección
- [ ] **Path Cuotas / calcular_cuotas**: Switch1 out6 → Edit Fields Cuotas → AI Agent. ~~El tool `Simulador Cuotas` está roto.~~ Validado en test (2026-02-27). Pendiente deploy a prod junto con actualprod.

### 🔜 Próximo: Testing v3
- [ ] **Test cada path en v3**: saludo, búsqueda, cuotas, cuotas follow-up, permuta, admin, papeles, cambio de tema
- [ ] **Test error recovery**: fallo de OpenAI, fallo de Bluelytics, fallo de Sheets
- [ ] **Ajuste system prompt**: según resultados de testing
- [ ] **Deploy v3 a prod**: requiere spec de deploy con rollback plan

### 🔜 Backlog (requieren spec antes de implementar)
- [x] ~~**Phase 2 — Redis Stage Machine**~~: Implementado como parte de Trebol v3 (conv_state en Redis, TTL 24h).
- [ ] **RAG Comportamental**: Few-shot dinámico desde `conversaciones_feedback` en MongoDB. Dependencia: 10+ conversaciones exitosas guardadas.
- [ ] **Fix AlertasVendedores**: Agregar Respond to Webhook, fallback Switch, null-guard group_id, incluir nombre en mensajes. Ver `docs/issues/2026-03-03-audit-bugs.md`.

---

## Infra y Estabilidad
- [x] **Redis Hardening + Worker Limits** (2026-02-27 ejecutado): volatile-lru activo en prod, concurrencia=5, memory limit 2G en worker. Redis y worker recreados. Todos los clientes reconectaron (<4s downtime).
- [ ] **Deploy actualprod → prod** (spec: `2026-02-27-redis-hardening-worker-limits-prod.md`): Fase 2. Ejecutable ahora (Fase 1 completa).
- [ ] **TTL en claves `{chat_id}` post-RPUSH**: agregar `EXPIRE {chat_id} 300` en nodo Code de actualprod. Mitiga keys huérfanas si falla entre loop y send. Requiere spec de workflow.
- [ ] **Sincronizar INTERÉS CONFIRMADO**: actualprod tiene versión pre-simplificación. trebol22 tiene versión simplificada. Definir versión canónica y unificar en ambos workflows.
- [ ] **Backups Encriptados:** GPG para backups a R2. (Verificar si ya está resuelto)
- [ ] **Certificados Internos:** Eliminar `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- [ ] **Monitor de RAM:** Alertas de consumo >85%.

---

## Trebol v4 Test — Refactoring de consolidación (2026-04-03)

> **⏸ PAUSADO 2026-04-14** — Dejamos de iterar sobre `trebol_v4_test.json` por ahora. Toda la sección queda como referencia histórica. Los pendientes (deploy a prod F1+F2+F3+F4+F5, smoke test Jeep Compass, bugs A/E/F/Rocío, monitor de `llm_drift_events`) siguen abiertos pero no se trabajan hasta retomar el tema explícitamente. Working tree del workflow en estado post-Fase 5 sin smoke test — NO commitear hasta validar.

Objetivo: reducir ~152 → ~85 nodos manteniendo TODA la lógica de negocio determinística.
Principio: consolidar nodos, NO mover lógica crítica al LLM. Las guardias siguen en código.

### Fase 1: Unificar guardias (~8 nodos eliminados) ✅
- [x] Reemplazar Switch Guardia + 6 Guardia handlers + Edit Fields Guardia → 1 Code node "Handler Guardia"
- Resultado: `IF Guardia Activa` + `Handler Guardia` (Code) + `Guardia Save Chat`. 142 nodos funcionales.
- Completado en sesión previa (verificado 2026-04-06)

### Fase 2: Consolidar Edit Fields fan-out (~6 nodos eliminados) ✅
- [x] Reemplazar Edit Fields5/6/7 + Edit Fields Cuotas + Instrucciones Compra + Extraer Parámetros Cuotas → 1 Code node "Construir Instrucción"
- Resultado: 142 → 137 nodos funcionales. Switch1 outputs [4-8] todos apuntan a "Construir Instrucción" → "Check Primer Mensaje"
- Lógica de `extraerMonto` (anticipo) y `extraerAnio` inlined en case 'cuotas'
- Completado 2026-04-06

### ~~Fase 3: Unificar foto pipeline~~ — DESCARTADA (decisión del usuario 2026-04-06)

### Fase 3 (ex-4): Consolidar post-alert pipeline + ajustes determinísticos ✅
- [x] Consolidar detectar alerta sinfotos + Detectar Confirmacion Contacto + Combinar Handoff → Code node "Evaluar Alerta"
- [x] Limpieza de redundancias y ajustes en lógica determinística (guardias, clasificador, post-processing)
- Resultado: 137 → 139 nodos. Completado 2026-04-06

### ~~Fase 4 (ex-5): Tools nuevos para AI Agent~~ — DESCARTADA (redundante, 2026-04-06)
- `consultar_estado_lead` redundante: AI Agent ya recibe estado completo via proximoObjetivo
- `registrar_dato_crm` redundante: Extraer Datos CRM ya escribe a Sheets automáticamente
- Además, darle write al CRM al LLM viola el principio "lógica crítica en código, no en prompt"

### Pendientes v4 (2026-04-07)

- [ ] **Gate determinístico anticipo < mínimo pre-cuotas**: Cuando el cliente pide simulación de cuotas pero su anticipo/presupuesto < anticipo_minimo del vehículo, el AI Agent llama `calcular_cuotas` igual. Necesita gate determinístico (en `Parse Chain Output` o `Construir Estado CRM`) que intercepte ANTES de que el AI Agent llame la tool: si `anticipo_cliente < anticipo_minimo_vehiculo` → overridear respuesta con "tu presupuesto no alcanza para cubrir el anticipo del vehículo, pero si querés te puedo poner en contacto con administración para armar un plan a medida." El anticipo_minimo viene del RAG (campo anticipo del vehículo) y se guarda en Redis `ficha_enviada` cuando se muestra la ficha.
- [ ] **IF Ficha Mostrada — n8n serialization bug**: `$json.output.ficha_mostrada` evalúa a `''` en vez de boolean pese a que Parse Chain Output retorna `ficha_mostrada: false`. Workaround: `typeValidation: "loose"`. Root cause no identificado — posible bug de n8n 2.2.4 Queue Mode con serialización de objetos nested en Code node output. Investigar con n8n debug mode o probar con `JSON.parse(JSON.stringify(finalJson))` en el return.
- [ ] **Presupuesto CRM vs detección**: El display de `estado_calificacion` ahora usa `presupuestoEfectivo` (regex) como fallback cuando CRM no tiene el dato. Funciona pero regex puede dar falsos positivos con números. Ideal: confiar solo en CRM (Sheets) + mejorar velocidad de `Extraer Datos CRM` → Sheets update.

### Regression suite ampliada (2026-04-10)

Después de deployar F1+F2+F3 a test, se documentaron dos conversaciones reales de prod como bad-convs golden y se agregaron al test harness:

- **`results/bad-conv-20260409-v4-tiago-drift-permuta.md`** — Conversación real prod de Tiago (exec 18255+). 7 bugs documentados: post-tool-call drift, km interpretado como presupuesto, repetición de "¿cuántos km?" 3+ veces, pide datos de permuta ya dados, busca auto de permuta en inventario, muestra autos no pedidos, financiación no solicitada.
- **`results/bad-conv-20260408-v4-rocio-up-km-repetido.md`** — Conversación real prod de Rocío (VW Up + Gol Power permuta). 3 bugs documentados: repetición de "¿cuántos km?", pregunta estado sin cerrar financiación, ficha duplicada.

**Escenarios nuevos en `scripts/test_conversation.sh`:**
- `tiago_full` — 5 turnos, 10 checks (conversación completa de prod con asserts anti-drift, anti-fichas, anti-repetición)
- `rocio` — 4 turnos, 6 checks (catalogo_ml + permuta + km repetido)
- Helper nuevo `assert_no_match` para validar anti-patrones

**Resultado de la suite completa (2026-04-10, post Fase 4): 38/38 PASS**

| Escenario | Checks | Resultado | Bugs prod corregidos |
|-----------|--------|-----------|----------------------|
| `tiago` | 5 | PASS | Regresión simple F1/F2 |
| `tiago_full` | 10 | PASS | Drift presupuesto, km=ppto, repetición km, buscar permuta en inventario |
| `rocio` | 6 | PASS | Repetición km, ficha duplicada |
| `hilux` | 1 | PASS | Contrarregresión compra normal |
| `matias_c3` | 9 | PASS | Bug B (pesos no parseados), Bug C (anticipo_insuficiente con ARS→USD) |
| `agustina_raptor` | 7 | PASS | Bug D (drift: bot muestra vehículo de permuta en stock) |

**Comportamientos subóptimos detectados (no bloqueantes, backlog):**

- [ ] **Guardia permuta vs pregunta del cliente — priority inversion**: En el caso Rocío T4, la cliente pidió "Bueno, coméntame" (respuesta a oferta de financiación del bot), pero la guardia permuta siguió su state machine y preguntó por fotos en vez de responder la pregunta de financiación. No es broken (el state machine funciona), pero idealmente el bot debería poder pausar la guardia para responder una pregunta explícita del cliente y retomarla después. Requiere lógica de "interrupt/resume" en `Construir Estado CRM`.
- [ ] **`mensaje2` repetido en catalogo_ml con permuta**: En el caso Rocío, `mensaje2` devuelve "Rocío, contame qué tenés para permutar" en múltiples turnos pese a que ya dijo "tengo un gol power 2011" en el turno 2. Revisar override mensaje2 en `Parse Chain Output` > guardia post-ficha ML — no está detectando que la cliente ya dio el dato de permuta.
- [ ] **Inventario test desincronizado con prod**: VW Up Cross 2016 existía en prod cuando se generó la conversación bad-conv, pero el test inventario (MongoDB Atlas + Sheets) no lo tiene. Los tests golden siguen pasando porque el harness valida que el bot maneje el caso "no tenemos X" correctamente (pide nombre, no repite ficha), pero para tests 100% fieles a prod habría que sincronizar inventario test ← prod periodicamente o usar un snapshot congelado.

### Pendientes v4 (2026-04-09, abiertos al cierre de sesión F3)

- [ ] **Limpieza de fila CRM stale del número de test**: la fila 44 del CRM Sheets test (tel `5491150635028`) tiene valores pollution de corridas pre-F2 (`VEHICULO QUE ENTREGA="Ford Focus"`, `PRESUPUESTO APROXIMADO=25000`, `VEHICULO DE INTERÉS="auto para hacer Uber"`) que contaminan nuevos runs del harness golden. El regex del golden sigue validando lo correcto, pero el bot menciona "Ford Focus" en lugar del vehículo nuevo. Opciones: (a) agregar paso opcional en `scripts/test_conversation.sh --reset-crm` que limpie la row via Sheets API, (b) cambiar la row manualmente desde el UI de Sheets, (c) usar otro número de test sin historial. No bloqueante — los tests automatizados pasan igual, pero afecta la legibilidad del output.
- [ ] **Monitor pasivo de `llm_drift_events`**: la tabla está creada y el detector activo pero nadie la mira. Definir: (a) cron diario que cuente eventos y alerte si >0 por día, (b) dashboard simple (query SQL agendada via n8n) o (c) integración con AlertasVendedores para postear drift events al grupo de operaciones. Decidir antes de deploy a prod para que el detector tenga valor operacional.
- [ ] **Fallback a payload real cuando exista conversación de test en Chatwoot**: El harness `scripts/test_conversation.sh` usa conversation_id sintético que hace fallar `HTTP Request` a Chatwoot, lo que aborta nodos paralelos (`Guardia Save Chat`, `Redis GET offered_contact`). Actualmente se emula `Guardia Save Chat` insertando manualmente en `n8n_chat_histories`, pero no se emulan los otros side effects. Si en el futuro necesitamos testear flows que dependen de esos nodos, agregar modo `--chatwoot-real` que resuelva un conversation_id real via la misma lógica de `scripts/test-chat.sh:resolve_conversation_for_number`.
- [ ] **n8n execution quirk — parallel branches y fallas**: documentado durante F3.2 pero no reportado upstream. Cuando un nodo A tiene múltiples downstream en un mismo output array `[[B, C, D]]`, n8n los ejecuta secuencialmente en el orden de la lista. Si B (o cualquier descendiente de B) falla, C y D nunca se ejecutan pese a parecer "paralelos" visualmente. Esto importa para cualquier logging/observabilidad en rama paralela. Considerar si amerita issue en github.com/n8n-io/n8n o si es intencional. Para nodos de observabilidad, conectar a outputs separados (multi-output en Code) no resuelve el problema porque es el mismo engine de execution. Workaround: nodos Postgres de logging con `onError: continueRegularOutput` + conectarlos ANTES de nodos propensos a fallar (ej: HTTP Request a Chatwoot).

---

### Bug crítico 2026-04-09 — Post-tool-call context drift + permuta guardia gap

**Estado al 2026-04-09 (cierre de sesión)**:
- ✅ Fase 1 (F1.1/F1.2/F1.3) — aplicada en test, validada, commit `927df78`
- ✅ Fase 2 (F2.1/F2.2/F2.3) — aplicada en test, validada, commit `a74034b`
- ✅ Fase 3 (F3.1 drift detector + F3.2 test harness golden) — aplicada en test 2026-04-09, validada (tiago 5/5 + hilux 1/1 pass, 0 falsos positivos en llm_drift_events)
- ⏳ **Deploy a prod** — PENDIENTE, requiere confirmación explícita del usuario. Afecta `wf4ts1WKcpOaE90A__FkD` (Trebol v4 prod). Backup pre-cambio existe en commit `826c8d9`. Ver sección "Pendiente — Deploy a prod" al final de este bloque.

**Síntoma**: Cliente real (Tiago, +5493404510469) entra con "Hola soy tiago, tengo un Ford ka 2013 viral 1.0". Bot guardia permuta activa, pide km. Cliente dice "187700". La guardia NO se reactiva, cae al AI Agent, que termina mostrando "opciones para tu presupuesto hasta U$S 10.000" (inventado). De ahí en adelante el CRM se contamina: nombre="Focus", presupuesto="187700", y la conversación queda tosca 10+ turnos.

**Root cause chain** (debuggeado via exec 18255 en prod):

1. **Permuta guardia gap**: `Construir Estado CRM` línea 186 exige `entregaEfectiva && nombreEfectivo`. En turno 3, `nombreEfectivo=false` porque:
   - El regex de fallback historial (línea 54) solo matchea `/me llamo|mi nombre/` → NO matchea "soy tiago"
   - Agregar "soy X" al regex rompe con "soy de La Pampa", "soy cliente", etc.
   - CRM Sheets aún no tenía el dato (Extraer Datos CRM async ~5-10s)
2. **Post-tool-call drift en el AI Agent**: Run 0 del LLM respondió correctamente ("anoté que tenés Ford Ka 2013 con 187.700 km"), pero AL MISMO TIEMPO llamó `buscar_inventario_autos` (por regla "sin excepción" del prompt). LangChain descarta el texto de run 0 (lo trata como thought), re-invoca el modelo con ToolMessage, y run 1 genera respuesta NUEVA anclada en tool results (Chevrolet Tracker, Captiva) → alucina "hasta U$S 10.000".
3. **Contradicción en system prompt**:
   - Línea 2: "Antes de mencionar CUALQUIER vehículo, DEBÉS llamar buscar_inventario_autos. Sin excepción."
   - Línea 36: "REGISTRAR PERMUTA: 'tengo un X' → NO buscar en inventario"
   - El modelo sigue la regla más estricta ("sin excepción") y llama el tool igual.
4. **Extraer Datos CRM pollution** (turnos subsiguientes): LLM alucina `nombre: "Focus"` (nombre de vehículo) y `presupuesto: "187700"` (km), escribe a Sheets. Actualizar Sheet CRM es appendOrUpdate sticky → el valor malo persiste turnos enteros aunque el LLM después devuelva vacío.

**Evidencia**: Ver `/tmp/exec_18249.json` hasta `18303.json` (prod executions). 35 executions para esa conversación.

**Plan de fixes — Fase 1 (root cause, alta prioridad)** ✅ COMPLETADA 2026-04-09 (test):

- [x] **F1.1** — `Construir Estado CRM`: `botEnMidPermuta = /kilómetros tiene|qué año es|año que es|estado se encuentra|enviarnos.*fotos.*evalu|podrías.*fotos/i.test(ultimoMsgBot)`. Condición de guardia cambia a `if (entregaEfectiva && (nombreEfectivo || botEnMidPermuta) && alertaEnviada !== 'si')`. La guardia permuta sostiene el flujo aunque el CRM async pierda `nombreEfectivo`.
- [x] **F1.2** — `prompts/trebol_v4_system_prompt.txt` + `systemMessage` del AI Agent: "Sin excepción" → "EXCEPCIÓN PERMUTA: si el cliente menciona un vehículo como vehículo a ENTREGAR → NO llamar buscar_inventario_autos". Contradicción con sección PERMUTA eliminada.
- [x] **F1.3** — State-gated tools: `Construir Estado CRM` expone `bloquear_busqueda = entregaEfectiva && !vehiculoEfectivo`. El `systemMessage` del AI Agent inyecta condicionalmente (vía expresión n8n `={{ ... }}`) un bloque `⛔ BLOQUEO DE TOOL EN ESTE TURNO` que instruye NO llamar `buscar_inventario_autos`. Defensa en profundidad sobre F1.1/F1.2.

**Validación en test (regresión Tiago)**:
```
>>> "Hola soy tiago, tengo un Ford ka 2013 viral 1.0"   → "¿Cuántos kilómetros tiene?"     ✓ guardia permuta
>>> "187700"                                             → "¿En qué estado se encuentra?"  ✓ F1.1 sostiene guardia
>>> "perfecto estado"                                    → "¿Podés enviarnos fotos...?"    ✓ CRM sync + label OK
>>> "ya te mando las fotos"                              → "Perfecto, ya le aviso..."       ✓ cierre + alerta
```
Contrarregresión compra: `"hola busco una hilux"` → bot invoca `buscar_inventario_autos` y muestra fichas. F1.2 no rompe el path normal.

**Fase 2 (defensas secundarias)** ✅ COMPLETADA 2026-04-09 (test):

- [x] **F2.1** — Context pinning: `Construir Estado CRM` detecta `preguntaBotAnterior` (6 categorías: km/año/estado/fotos del vehículo de permuta, nombre, presupuesto). El `systemMessage` del AI Agent inyecta condicionalmente un bloque `<TURNO_ACTUAL_CRITICO>` con el contexto literal de la pregunta previa — fuerza al LLM a interpretar la respuesta como respuesta a esa pregunta, no como dato nuevo.
- [x] **F2.2** — `Extraer Datos CRM` anti-pollution: secciones PRESUPUESTO y NOMBRE reforzadas con prohibiciones explícitas + 4 EJEMPLOS ANTI-POLLUTION few-shot negativos incluyendo el caso Tiago literal ("tengo un Ford Ka 2013 [...] 187700 [...] perfecto estado" → `nombre=null, presupuesto=null, entrega={km:187700, estado:"perfecto estado"}`).
- [x] **F2.3** — `Parser JSON CRM` downgrade guards: (1) si primera palabra de `nombre_extraido` matchea `modelosRegex` → nullify. (2) si `presupuesto_extraido` numérico aparece en `entrega` string → nullify. Ambos guards son redes de seguridad determinísticas post-LLM.

**Validación (2026-04-09, exec 21507)**:
`Extraer Datos CRM` con mensaje combinado "Hola soy tiago, tengo un Ford ka 2013 viral 1.0 / 187700 / perfecto estado" devolvió:
```json
{"nombre": null, "presupuesto": null, "entrega": {"marca":"Ford","modelo":"Ka","anio":2013,"km":187700,"estado":"perfecto estado"}}
```
Antes (exec 18279): `nombre="Focus"`, `presupuesto="187700"`. Ahora: limpio. F2.2/F2.3 funcionaron.

Regresión Tiago 4 turnos: guardia permuta sostenida, cierre limpio con alerta vendedor, sin drift.
Contrarregresión compra ("busco una hilux"): `buscar_inventario_autos` llamado normalmente.

**Fase 3 (observabilidad)** ✅ COMPLETADA 2026-04-09 (test):

- [x] **F3.1** — Detector de "LLM drift" en `Parse Chain Output` + 2 nodos nuevos (`IF LLM Drift` + `Log Drift Event` Postgres INSERT). 5 patrones de drift: `hasta U$S N`, `opciones ... U$S N`, `presupuesto hasta`, `rango de hasta`, `dentro de U$S`. Condición: no match si `presupuestoEfectivo || presupuestoEnMensaje || presupuestoLimpio`. Logs a tabla `llm_drift_events(id, created_at, chat_id, exec_id, turno, mensaje_cliente, respuesta_bot, patron_detectado, crm_presupuesto, detalle jsonb)` en DB `postgres` (misma que `n8n_chat_histories`). Script: `scripts/apply_f3_drift_detector.py`. Patch idempotente, Code node sigue en typeVersion 1.
- [x] **F3.2** — Test harness golden: `scripts/test_conversation.sh`. Dispara mensajes sintéticos al webhook de n8n (bypass Chatwoot → no requiere credenciales), espera la nueva execution, y extrae el output de `Parse Chain Output` desde `execution_data` usando `flatted` (patrón del memory `reference_n8n_exec_debug.md`). Como `HTTP Request` a Chatwoot falla con conversation_id sintético y aborta nodos paralelos pendientes (Guardia Save Chat), el harness emula manualmente la inserción en `n8n_chat_histories` después de cada turno para preservar el historial multi-turn. Escenarios: `tiago` (4 turnos regresión permuta) y `hilux` (contrarregresión compra). Uso: `bash scripts/test_conversation.sh [tiago|hilux|all]`.
- **Resultado validación 2026-04-09**: tiago 5/5 pass (guardia permuta sostenida los 4 turnos, sin drift de presupuesto), hilux 1/1 pass (`buscar_inventario_autos` llamado, ficha Hilux mostrada), `llm_drift_events` vacía (0 falsos positivos).
- **Limitación conocida**: el CRM Sheets puede tener pollution stale de corridas pre-F2 (ej: `VEHICULO QUE ENTREGA="Ford Focus"` de un run viejo) que el harness no limpia — el regex del golden sigue validando lo correcto, pero el bot puede mencionar el auto "contaminado" en vez del nuevo. Para tests 100% determinísticos habría que limpiar la row del CRM también (pendiente, no bloqueante).

**Pendiente — Deploy a prod** (requiere confirmación explícita del usuario):

Ambas fases (F1.1-F1.3 + F2.1-F2.3) están validadas en test (workflow `chkkStDHenGFhwE7`). El deploy a prod (`wf4ts1WKcpOaE90A__FkD`) NO se ejecutó porque el usuario dijo textualmente "nunca deployees a prod" durante la sesión (guardado como memoria permanente `feedback_never_deploy_prod.md`).

Para deployar (cuando el usuario lo pida explícitamente):
1. Backup pre-cambio ya existe: commit `826c8d9` (`trebol_v4_prod_vps_snapshot_2026-04-09.json`)
2. Tomar snapshot adicional pre-deploy: `scripts/backup-workflow.sh wf4ts1WKcpOaE90A__FkD prod`
3. Deploy: `bash scripts/deploy-workflow.sh workflows/trebol_v4_test.json wf4ts1WKcpOaE90A__FkD` (IMPORTANTE: el archivo `trebol_v4_test.json` es la fuente de verdad — NO usar `trebol_v4_prod_ready.json` viejo)
4. Restart: `docker restart trebol-prod-n8n trebol-prod-n8n-worker`
5. Post-deploy: `bash scripts/clear-chat-memory.sh 5491150635028 prod`
6. Smoke test con número de prueba real
7. Monitoreo 1-2 horas en logs de `trebol-prod-n8n` para verificar que no hay regresiones en clientes reales
8. Rollback si hay problemas: re-importar `trebol_v4_prod_vps_snapshot_2026-04-09.json` con el mismo script

Riesgo bajo: los cambios son todos aditivos (regex nuevos, guards nuevos, prompts más estrictos). No hay remociones de lógica ni cambios de shape en outputs críticos. Las dos fases son independientes en funcionamiento pero deben deployarse juntas porque F2 asume F1 activa.

---

### Bug crítico 2026-04-12 — Handoff blando Jeep Compass (Fase 5 — Bot Off duro)

**Estado al 2026-04-13**:
- ✅ Diagnóstico completo: `results/bad-conv-20260412-v4-jeep-compass-handoff-blando.md`
- ✅ Fase 5 — aplicada a test, 149 nodos (141 → +8), ambos workflows deployados a test (`chkkStDHenGFhwE7` y `GyW7SjZluIdZyAYt_9LIO`), workers reiniciados, memoria test limpia
- ⏳ **Smoke test en test** — PENDIENTE (escenario Jeep Compass real al 5491150635028)
- ⏳ **Deploy a prod** — PENDIENTE, requiere confirmación explícita

**Root cause**: `bot_status` se leía en el workflow pero nunca se seteaba desde el pipeline. Los 3 nodos `Set Bot Off*` ejecutaban UPDATE via `dblink_exec` contra Chatwoot DB — el UPDATE sucedía (verificado con psql: conv 323 → `{"bot":"off"}`) pero los webhooks siguientes seguían trayendo `custom_attributes: {}`. Chatwoot serializa el Conversation desde Rails al emitir webhook — si el update bypassa Rails (dblink directo), el serializer no invalida caché y el bot nunca ve el flag.

**Fix aplicado (`scripts/apply_bot_off_fix.py`, idempotente)**:

- [x] **A — HTTP PATCH Chatwoot API** (reemplaza dblink): los 3 `Set Bot Off*` ahora son `n8n-nodes-base.httpRequest` typeVersion 4.2 → `PATCH /api/v1/accounts/{acount_id}/conversations/{converssation_ID}/custom_attributes` body `{"custom_attributes":{"bot":"off"}}`. Pasa por Rails → serializer se entera → siguientes webhooks reflejan `bot: "off"`.
- [x] **B — Redis flag como source of truth** (3 motivos: handoff, foto, papeles): después de cada Set Bot Off, 2 nodos nuevos por motivo:
  - `Redis SET Bot Off [motivo]` → key `{chat_id}:bot_off` valor `motivo`, TTL 72h (259200s)
  - `Alerta Bot Off [motivo]` → POST `$env.INTERNAL_WEBHOOK_URL/webhook/alertas-vendedores` con `tipo_alerta: bot_off`, telefono, motivo, conversation_url
- [x] **C — Early pipeline gate** (short-circuit antes de cualquier LLM call): entre `Edit Fields` y el resto del pipeline, 2 nodos nuevos:
  - `Redis GET Bot Off Flag` → key `{chat_id}:bot_off`, propertyName `bot_off_flag`
  - `IF Bot Off Flag` → condition `$json.bot_off_flag` notEmpty → true=dangling (silence), false=flujo normal
- [x] **D — AlertasVendedores case `bot_off`** (`workflows/alertasvendedores_test.json`): nuevo output del Switch Tipo Alerta + Code node `Formatear Bot Off` que genera mensaje "🛑 BOT APAGADO 🛑" al grupo administración con telefono, motivo label (handoff/papeles/foto), URL de la conversación y timestamp AR.

**Archivos afectados**:
- `workflows/trebol_v4_test.json` — 141 → 149 nodos (+8). Backup: `.bak.pre-bot-off-fix`
- `workflows/alertasvendedores_test.json` — +1 case Switch + Code node `Formatear Bot Off`. Backup: `.bak.pre-bot-off`
- `scripts/apply_bot_off_fix.py` — patch script idempotente
- `results/bad-conv-20260412-v4-jeep-compass-handoff-blando.md` — postmortem del caso

**Bugs resueltos implícitamente** (corolarios de A):
- [x] **Bug B** — Re-envío de ML link reinicia ciclo completo post-handoff → resuelto por el gate (no llega al clasificador)
- [x] **Bug C** — Respuesta fuera de contexto en segundo ciclo → no existe, no hay segundo ciclo
- [x] **Bug D** — "Qué vehículo te interesa" post-alerta → el gate lo bloquea antes del AI Agent

**Pendientes Fase 5**:
- [ ] Smoke test real del fix en test (escenario Jeep Compass: permuta completa → handoff → verificar silencio en T6/T7 + alerta bot_off en grupo vendedores + Chatwoot UI muestra `custom_attributes.bot=off`)
- [ ] Helper `assert_no_response` en `scripts/test_conversation.sh` para automatizar la regresión
- [ ] Deploy a prod — JUNTO con F1/F2/F3/F4 pendientes (requiere pedido explícito)

---

### Bug crítico 2026-04-10 — Bad convs Matias C3 + Agustina Raptor (Fase 4)

**Estado al 2026-04-10**:
- ✅ Fase 4 (Bugs B, C, D) — aplicada en test, 38/38 golden PASS (tiago, tiago_full, rocio, hilux, matias_c3, agustina_raptor)
- ⏳ **Deploy a prod** — PENDIENTE, requiere confirmación explícita (misma regla `feedback_never_deploy_prod.md`). Se deploya JUNTO con Fase 1/2/3 pendientes.

**Casos documentados**:
- `results/bad-conv-20260410-v4-matias-debounce-anticipo.md` — Citroën C3 + anticipo en pesos insuficiente, bugs A (O6 debounce), B (parseo pesos), C (anticipo_insuficiente con ARS), D (alucinación alternativas 10× sobre budget), E (catalogo_ml fuerza pedir presupuesto), F (`v:"¡Hola!"` en Redis).
- `results/bad-conv-20260410-v4-agustina-permuta-raptor.md` — Ford Raptor permuta + ML Everest, bugs A (O6), B (guardia empieza de cero cascada de A), C (guardia salta a "qué querés comprar"), D (drift permuta en inventario), E (repetición km), F ("PERMUTA" keyword resetea state machine).

**Fixes aplicados (Fase 4)** ✅ COMPLETADA 2026-04-10 (test):

- [x] **B1** — `Inyectar Conversión Pesos`: patrón regex 4 nuevo para `\d{1,3}(?:\.\d{3}){2,}` (dot-separated ≥7 dígitos) con lookbehinds fixed-width split `(?<!U\$S\s)(?<!U\$S)(?<!USD\s)(?<!USD)` para excluir `U$S N`. Cubre "5.500.000" y "5.500.000 $" sin romper "U$S 1.000.000".
- [x] **C1** — `Construir Estado CRM` `anticipo_insuficiente`: triggers ampliados (`entregando/aporto/dispongo/cuento con/...`) + ARS→USD via `Fetch Dólar Blue` cuando `num >= 100_000`. Gate: `numUSD >= 500 && numUSD < _minimoConocido` → `guardia_tipo='anticipo_insuficiente'` + mensaje determinístico con derivación.
- [x] **C2 (collateral)** — `Parse Chain Output` parseo de montos con coma-miles: `replace(/[.,]/g, '')` al extraer `anticipo_min_en_ficha`, `contado_en_ficha`, `permuta_en_ficha`. Antes "U$S 5,000" parseaba a 5.0 → Redis guardaba `m:5` → gate nunca disparaba.
- [x] **D1** — `Construir Estado CRM` `vehiculoPermuta` extraction: regex best-effort (`tengo (?:un|una)|para (?:vender|entregar|permutar)|tomarán como pago|ofrezco|entrego`) con limpieza post. Expuesto en el output del CRM como `vehiculo_permuta`.
- [x] **D2** — `AI Agent.systemMessage`: regla absoluta inyectada condicionalmente (`vehiculo_permuta !== null`): `⛔⛔⛔ REGLA ABSOLUTA — VEHÍCULO DE PERMUTA` con enumeración explícita (NI principal, NI alternativa, NI "similar"...) + instrucción "si `buscar_inventario_autos` devuelve resultados con palabras del permuta, DESCARTÁ silenciosamente". Versión blanda previa fue racionalizada por el LLM.
- [x] **D3** — Extracción de año/km/estado del textoCompleto con regex, display en `contexto_conversacional` y `estado_calificacion` con ✅ + valores concretos. Reduce re-preguntas del bot por datos ya dados.
- [x] **D4 (collateral)** — `botEnMidPermuta` y `botPreguntFotos` regex: `evalu` → `eval[uú]e|evaluen`. Sin esto T4 Tiago ("ya te mando las fotos") caía al AI Agent porque el regex no matcheaba "evalúe" (`u ≠ ú`).
- [x] **H1 (harness)** — `scripts/test_conversation.sh` `persist_history` idempotente: compara `MAX(id)` de `n8n_chat_histories` pre/post-exec. AI Agent path (Chat Memory saved ≥2 rows) → skip insert; guardia path (0 rows) → insert 2. Antes duplicaba en agustina_raptor y disparaba guardia "elegir vehículo" incorrectamente por `fichasNumeradas=2`.

**Bugs NO cubiertos (backlog Fase 5+)**:

- [ ] **Bug A — Debounce O6 race condition** (`bad-conv` Matias y Agustina): mensajes durante processing (~20-30s) se pierden. Matias: "Entregando 5.500.000" desaparece del buffer entre LPUSH y LRANGE porque `Final Redis Buffer Cleanup` de la exec anterior lo consume. Agustina: dos webhooks ML simultáneos → solo el template se procesa, el mensaje con permuta detallada se pierde. Requiere pending queue fuera del buffer (spec nueva, no trivial). Limitación documentada en trebol_workflow.md sección "Sin pending queue (O6)".
- [ ] **Bug E — `catalogo_ml` fuerza pedir presupuesto con vehículo ya matcheado**: cuando cliente entra con ML link y el vehículo existe en stock, el bot pide nombre + presupuesto antes de responder. Observación: el vehículo y su precio ya son data efectiva → el presupuesto debería inferirse del precio de la ficha + tolerancia, y solo pedir nombre. Fix: en `Construir Estado CRM`, cuando `vehiculoEfectivo=true` desde turno 1 (match ML link), `proximoObjetivo = 'Pedir solo nombre'` y saltar presupuesto. Impacta `catalogo_ml` y `catalogo_ml_financiacion` en `Construir Instrucción`.
- [ ] **Bug F (Agustina) — "PERMUTA" keyword resetea state machine**: cliente escribe "PERMUTA" en mayúsculas (frustrado) con datos ya dados en turnos previos. El bot responde "Perfecto, pasame marca, modelo, año y kilómetros" como si fuera la primera vez. Fix: si `guardia_context.permuta.datos_parciales` ya tiene año/km/estado, el keyword PERMUTA no debe resetear — requiere persistir `datos_parciales` entre turnos (actualmente se re-evalúa desde textoCompleto cada turno).
- [ ] **Bug F cosmético (Matias) — `v:"¡Hola!"` en Redis ficha_enviada**: `Parse Chain Output` extracción de `vehiculo_en_ficha` toma la primera línea no-emoji del mensaje, captura "¡Hola!" cuando viene prepended. Severidad baja — `m/c/p` (montos) se extraen bien. Fix: saltear líneas que matchean `/^¡?hola/i` en la extracción de `vehiculo_en_ficha`.
- [ ] **Rocío — Guardia permuta vs pregunta del cliente (priority inversion)**: documentado previamente. En T4, cliente pide "Bueno, coméntame" (responde a oferta de financiación), pero la guardia permuta sigue preguntando fotos. Requiere lógica de interrupt/resume en `Construir Estado CRM`.
- [ ] **Rocío — `mensaje2` repetido en catalogo_ml con permuta**: override de `Parse Chain Output > guardia post-ficha ML` no detecta que la cliente ya dio el dato de permuta en un turno previo. Revisar la condición del override.

**Deploy a prod — checklist actualizado (sin cambios vs Fase 3)**:

Se deploya JUNTO con Fase 1/2/3 pendientes. Los cambios de Fase 4 están todos en los mismos nodos ya tocados por F1/F2/F3 (`Construir Estado CRM`, `Parse Chain Output`, `AI Agent.systemMessage`, `Inyectar Conversión Pesos`) + harness (no afecta prod). Riesgo bajo: son todos aditivos. Ver checklist de deploy en la sección anterior (`Pendiente — Deploy a prod`).

---

**Referencias de patrones** (repos ya investigados en roadmap):
- **State-gated tools**: robocorp/llmstatemachine — tools expuestos según estado actual
- **Hard routing pre-LLM**: LangGraph — scoped handlers en vez de agent general
- **tool_choice control**: OpenAI Assistants / Anthropic Tool Use — forzar `none` en mid-flow
- **Context pinning XML**: Anthropic prompt engineering guide — XML tags al final del prompt tienen más atención
- Consenso: cuando el estado es determinable, NO usar LLM general. Trebol ya tiene esta arquitectura — el bug es que la guardia es demasiado estricta para activarse.

### Lo que NO se toca
- Debounce (Redis buffer + lock)
- Clasificador de intención (171 líneas de regex validadas)
- Construir Estado CRM (307 líneas, el cerebro)
- Parse Chain Output (327 líneas, post-processing)
- Basic LLM Chain (formatter JSON)
- AI Agent + tools actuales
- CRM update pipeline

### Investigación de referencia (2026-04-03) — COMPLETADA
Búsqueda de 25+ repos. Conclusión: el patrón híbrido state machine + LLM de Trebol es más completo que cualquier alternativa open-source encontrada. No hay un proyecto base para copiar — Trebol ya ES la referencia.

**Repos de referencia para patrones específicos:**
- [statelyai/agent](https://github.com/statelyai/agent) (343★) — XState state machines + LLM. Nuestro mismo patrón, formalizado con librería
- [robocorp/llmstatemachine](https://github.com/robocorp/llmstatemachine) (70★) — State-gated tools: restringir tools según estado actual
- [langgraph-sales-agent](https://github.com/yerdaulet-damir/langgraph-sales-agent) (11★) — Multi-tenant YAML config per client
- [n8n-claw](https://github.com/freddy-schuetz/n8n-claw) (346★) — Agente n8n avanzado con memory consolidation
- [SalesGPT](https://github.com/filip-michalsky/SalesGPT) (2600★) — Sales pipeline con stages, valida que nuestro enfoque determinístico es superior

**Patrones a considerar en el refactoring:**
- [ ] State-gated tools: exponer solo tools válidos según `guardia_tipo`
- [ ] YAML/JSON config per tenant para multi-client sin forkear workflow
- [ ] Memory consolidation nocturna para leads de larga duración
- [ ] Weighted lead scoring (0-100) en vez de caliente/tibio/frío

---

## Plataforma — Roadmap Paperclip (requiere confirmación para ejecutar)

0. ✅ Documentar visión (2026-04-03)
1. [ ] Paperclip en test — Container Docker, DB propia en Postgres test, Traefik route
2. [ ] Primer org-chart: El Trébol — Agentes WhatsApp Bot + Alertas, adapter HTTP → n8n
3. [ ] Approval flows — Alertas y derivaciones como tickets con aprobación humana
4. [ ] Segundo cliente via Paperclip — Onboarding parametrizado, validar aislamiento
5. [ ] Nuevos canales — Instagram bot como agente en org-chart del cliente

---

## Futuro
- [ ] **Canales Sociales:** Instagram y Facebook via Chatwoot.
- [ ] **MercadoLibre:** Workflow con OAuth2 y webhooks.