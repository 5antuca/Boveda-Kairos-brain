---
tags: [memoria, volcado, preferencias, arquitectura, workflow]
fecha_volcado: 2026-04-13
fuente: conversaciones Claude Code sesiones Trebol v4 F1/F2/F3
---

# Mis Preferencias de Arquitectura (observado en sesiones reales)

Esto es lo que aprendí operando con [[sobre-mi|Santi]] en decenas de iteraciones. Complementa [[Instrucciones Generales]].

## Principios que aplicás siempre

1. **Determinístico primero, LLM segundo.** Cualquier decisión de estado (¿ya mandamos la ficha?, ¿está en mid-permuta?, ¿el bot está off?) va a código duro (regex, Code nodes, Redis flags). El LLM solo genera texto o elige entre opciones acotadas. Si te propongo que el LLM decida si mandar una alerta o no, me corregís.
2. **Verify First, siempre.** Nunca asumas estado — navegá `Kairos_Brain/`, hacé `ls`, corré un SELECT antes de proponer. Si saco una conclusión sin haber grepeado, me detenés.
3. **Side effects a prod = pedido explícito.** Deployar a prod, tocar Evolution API prod, ejecutar `DELETE /instance/logout`, modificar Chatwoot prod → todo requiere autorización textual. Una autorización previa NO se extiende a siguientes acciones. Ver [[#Memorias duras]].
4. **Small diffs quirúrgicos.** Preferís 3 líneas cambiadas en 1 nodo antes que un refactor de sub-workflow. Si propongo reescribir algo grande, me pedís que lo parta en fases (F1, F2, F3…).
5. **Root cause > parche.** "Si la DB se cuelga, la solución no es subir el timeout de n8n" — arreglás el pooling o agregás índice. Aplicaste esto literalmente en el bug `Set Bot Off` (no era que faltaba reintentar — era que el webhook no refleja el side effect del dblink).
6. **SDD (Spec-Driven Development).** Cambios no triviales → spec en `specs/YYYY-MM-DD-nombre.md` antes de tocar JSON. Hotfix + .env restart no necesitan spec.
7. **Documentación es parte del deploy.** Cada cambio en workflow / .env / container / DB → actualizar `README.md` + `Kairos_Brain/contexto-claude/Architecture_Index.md` (o ficha relevante del vault) **antes** de cerrar. No después.

## Cómo te gusta recibir propuestas

- **Tradeoffs explícitos.** Si hay dos caminos (ej. Chatwoot API side-effect vs Redis flag), querés los dos con pros/contras, no que elija por vos sin avisar.
- **Fases numeradas** (F1, F2, F3…). Los fixes grandes van por fases con snapshot/backup antes de cada una. Patrón real: `trebol_v4_test.json.bak.pre-fase1`, `.bak.pre-f3`, `.bak.pre-bot-off-fix`.
- **Backup antes de operación destructiva.** Siempre. Incluso un `UPDATE` en Chatwoot prod requiere `pg_dump` del tabla afectada antes.
- **No adornes.** Respuestas cortas, directas, tono rioplatense (vos, no tú). No me digas "¡Claro! Con gusto te ayudo con esto."

## Cómo te gusta recibir código

- **No comentarios ornamentales.** Si la función se llama `construirEstadoCRM`, no pongas `// Construye el estado CRM`. Solo WHY no-obvio.
- **JSON con `indent=2, ensure_ascii=False`** al escribir workflows desde Python (preservar acentos).
- **Idempotencia obligatoria en scripts de patch.** Los `apply_*.py` deben chequear si el cambio ya fue aplicado antes de re-aplicarlo. Ejemplo: `if node_name in existing_names: print("skip"); return`.

## Memorias duras (aprendidas a la mala)

- **NUNCA `DELETE /instance/logout` en Evolution API prod.** Se pierde la sesión de WhatsApp del cliente. Ver [[feedback_evo_logout_prohibited]] en memory store.
- **NUNCA deploy a prod sin pedido explícito.** Incluso si "obviamente" el fix en test anda bien. [[feedback_never_deploy_prod]].
- **Switch node con `typeValidation: "strict"` obligatorio** en n8n — "loose" produce matches silenciosos raros. [[feedback_switch_node_strict]].
- **Anticipo ≈ presupuesto del cliente**, no una seña. Tratarlo como monto disponible cuando aparezca en guardias. [[feedback_anticipo_presupuesto]].

## Roadmap tuyo (visión a mediano plazo)

- **Paperclip como orquestador** (Node.js, port 3100) — plano de control de agentes (WhatsApp, Instagram, Meta Ads, Debugger, Supervisor). Multi-company con aislamiento, audit log, budgets, approval flows humanos.
- **Obsidian como editor humano** (este vault). Los agentes consultan MongoDB Atlas o Qdrant directo, no Obsidian.
- **Segundo canal: Instagram bot** como agente del org-chart del cliente (una vez que Paperclip esté en test).

Ver fases 0-5 del roadmap en `CLAUDE.md` del repo. Ninguna se ejecuta sin confirmación explícita.
