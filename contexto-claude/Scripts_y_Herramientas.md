---
tags: [memoria, volcado, scripts, herramientas, inventario]
fecha_volcado: 2026-04-13
---

# Scripts y Herramientas — Inventario Kairos

Qué hay en `scripts/` del repo y para qué sirve cada cosa.

## Deploy y operación

### `deploy-workflow-test.sh` ✅
**Uso**: `bash scripts/deploy-workflow-test.sh <file> <workflow_id>`
Deploya un workflow JSON a n8n test via API. Ver [[n8n_Gotchas#Deploy workflow]]. Recordatorio: post-deploy hay que reiniciar `trebol-test-n8n` y `trebol-test-n8n-worker`.

### `clear-chat-memory.sh` ✅
**Uso**: `bash scripts/clear-chat-memory.sh 5491150635028 test`
Limpia Postgres `n8n_chat_histories` + todas las keys Redis `v3:{chat_id}:*` para un número en test. **Modo prod removido** por seguridad — si necesitás limpiar prod, hay que hacerlo a mano con confirmación.

### `test_conversation.sh` ✅
**Uso**: `bash scripts/test_conversation.sh [tiago|hilux|all]`
Test harness golden: simula conversaciones completas disparando POST directo al webhook sin credenciales. Extrae resultados parseando `execution_data` con flatted. Útil para regresión automatizada sin tener que mandar WhatsApp real. Escenarios definidos: Tiago, Hilux, y `all` para correr ambos.

## Scripts de patch (idempotentes)

Todos siguen el patrón: leer JSON → chequear si el cambio ya está aplicado → modificar → escribir con `indent=2, ensure_ascii=False`. Idempotencia obligatoria ([[Preferencias_Arquitectura#Cómo te gusta recibir código]]).

### `apply_bot_off_fix.py` 🆕
Patch del [[2026-04-12 Handoff Blando Jeep Compass|fix handoff duro]]:
- Convierte los 3 `Set Bot Off*` de postgres dblink → HTTP PATCH Chatwoot API
- Agrega 3 Redis SET + 3 Alert Bot Off nodes
- Agrega 2 nodos del early pipeline gate (`Redis GET Bot Off Flag` + `IF Bot Off Flag`)
- Patchea `alertasvendedores_test.json` con case `bot_off` + `Formatear Bot Off` code node
- Hace backup previo en `.bak.pre-bot-off-fix`

### `apply_f3_drift_detector.py`
Fase 3 — agrega nodos para detectar drift del LLM (menciones de presupuestos en USD sin datos reales). Crea tabla `llm_drift_events` en Postgres test.

### `apply_punto2_bloquear_cuotas.py`
Punto 2 de una fase anterior — agrega guardia para bloquear simulación de cuotas si falta anticipo. Previene que el LLM invente cuotas sin presupuesto.

### `apply_punto4_presupuesto_regex.py`
Punto 4 de la misma fase — mejora el regex del clasificador para detectar presupuesto en más formas (ej. "tengo 20 palos", "hasta 15mil usd").

## Results — documentación de bad conversations

Carpeta `results/` con postmortems de conversaciones reales que salieron mal. Formato: `bad-conv-YYYYMMDD-v4-{cliente}-{tag-bug}.md`.

### Casos documentados
- `bad-conv-20260408-v4-rocio-up-km-repetido.md` — drift con km repetido
- `bad-conv-20260409-v4-tiago-drift-permuta.md` — drift en guardia permuta
- `bad-conv-20260410-v4-agustina-permuta-raptor.md` — PERMUTA keyword resetea state machine
- `bad-conv-20260410-v4-matias-debounce-anticipo.md` — debounce race + anticipo parsing
- `bad-conv-20260412-v4-jeep-compass-handoff-blando.md` — el caso canónico del [[2026-04-12 Handoff Blando Jeep Compass|handoff blando]]

Cada doc tiene: transcripción con bugs marcados `❌ BUG X`, diagnóstico, comparación "hubiera fallado con F1/F2/F3/F4?", y escenario de test de regresión.

## Backups del workflow

Patrón `trebol_v4_test.json.bak.{etapa}`:
- `.bak.pre-fase1`, `.bak.pre-fase2`, `.bak.pre-f3`
- `.bak.pre-bot-off-fix`
- `.bak.pre-context-compression`
- `.bak.guardia-refactor`
- `.bak.pre-puntos234`
- `.bak2` a `.bak17` — snapshots numerados (cronológicos)

Snapshots del estado del VPS (no patch step, son fotos del JSON productivo en un momento):
- `trebol_v4_test_vps_snapshot_2026-04-09.json`
- `trebol_v4_prod_vps_snapshot_2026-04-09.json`

## Comandos de debugging útiles (one-liners)

### Verificar typeVersion de Code nodes
```python
python3 -c "
import json
wf = json.load(open('workflows/trebol_v4_test.json'))
print([n['name'] for n in wf['nodes'] if n.get('type')=='n8n-nodes-base.code' and n.get('typeVersion')==2])
"
```

### Contar nodos de un workflow
```python
python3 -c "import json; print(len(json.load(open('workflows/trebol_v4_test.json'))['nodes']))"
```

### Listar todos los nombres de nodos
```python
python3 -c "
import json
wf = json.load(open('workflows/trebol_v4_test.json'))
for n in sorted(wf['nodes'], key=lambda x: x['name']):
    print(n['name'], '→', n['type'])
"
```

### Ver connections de un nodo específico
```python
python3 -c "
import json
wf = json.load(open('workflows/trebol_v4_test.json'))
print(json.dumps(wf['connections'].get('Set Bot Off', {}), indent=2))
"
```

## Skills / comandos del repo (CLAUDE.md)

Comandos de alto nivel que el agent puede invocar:
- `/new-spec` — Crear spec para un cambio significativo (SDD)
- `/deploy` — Ejecutar deploy de spec aprobada
- `/diagnose` — Investigar problema en prod
- `/prime-architecture` — Análisis arquitectónico
- `/prime-debug` — Root cause analysis
- `/prime-workflow` — Optimización de workflows
- `/prime-v4` — Contexto inicial Trebol v4

## Links

- [[Pipeline_v4]]
- [[n8n_Gotchas]]
- [[Redis_Postgres_Debug]]
- [[2026-04-12 Handoff Blando Jeep Compass]]
