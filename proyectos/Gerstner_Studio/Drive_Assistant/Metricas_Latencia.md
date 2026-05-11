---
tags: [gerstner-studio, drive-assistant, observability, metrics]
fecha-creacion: 2026-05-10
estado: ACTIVO — desplegado el 2026-05-10
relacionado: [[Drive_Assistant]], [[Spec_Fix_Matching_y_Cache]]
---

# Métricas de latencia — Drive Assistant

Cada request a `POST /api/chat/` emite una línea JSON con prefijo `[timing] `
en stdout del container `ai-gerstner-backend`. Las líneas son grepeables y
parseables con `jq` para sacar p50/p95, ratio cache HIT, identificar el
nodo lento, y detectar errores.

---

## Qué se captura

### Eventos

| Prefijo | Cuándo | Significado |
|---|---|---|
| `[timing] {...}` con `event: "chat_turn"` | Request exitoso | Turno completado, todos los nodos OK |
| `[timing] {...}` con `event: "chat_error"` | Request falló | El grafo lanzó excepción; queda registro con `total_ms` y los timings parciales que alcanzó a registrar |
| `[timing-node-error] node=X ms=Y err=...` | Un nodo individual lanzó | Línea adicional emitida por el wrapper `_timed` antes de re-raisear |

**Cobertura**: el log de `[timing]` se emite **siempre**, éxito o error. Si el
bot tira 30 queries y 3 fallan, vas a ver 30 líneas (27 `chat_turn` + 3
`chat_error`).

### Campos comunes

- `event` — `chat_turn` o `chat_error`
- `session_id` — UUID del chat (mismo entre turnos del mismo usuario)
- `total_ms` — tiempo total de `agent_graph.ainvoke()` (no incluye persistencia
  en `chat_sessions` ni el round-trip HTTP)
- `<nodo>_ms` — tiempo de cada nodo del grafo:
  - `parse_intent_ms` (skip si chat.py pre-populó intent por "más")
  - `match_folders_ms` (skip si pre-populó matched_folder_ids)
  - `check_cache_ms`
  - `search_drive_ms` (solo en cache MISS)
  - `save_cache_ms` (solo en cache MISS)
  - `generate_response_ms`

### Campos solo en `chat_turn` (éxito)

- `cache_hit` — true si todas las carpetas matcheadas estaban en cache
- `intent_project` — nombre del proyecto detectado (`"singer"`, `"bronco"`, `"general"`...)
- `matched_folders` — cantidad de carpetas elegidas (1-3)
- `files_returned` — cantidad de imágenes servidas al frontend (≤20)

### Campos solo en `chat_error` (fallo)

- `error` — `"<TipoExcepción>: <mensaje>"`. Los timings parciales también
  van si alcanzaron a registrarse antes del fallo.

---

## Cómo consultar

### Setup

```bash
# Una sola línea para parsear todo
docker logs ai-gerstner-backend 2>&1 \
  | grep '^\[timing\] ' \
  | sed 's/^\[timing\] //' \
  | jq -s '.' > /tmp/timings.json
```

A partir de acá usás `/tmp/timings.json` con cualquier query `jq`.

### Quick look — últimos 20 turnos

```bash
docker logs ai-gerstner-backend --tail 200 2>&1 \
  | grep '^\[timing\] ' \
  | sed 's/^\[timing\] //' \
  | jq -c '{event, total_ms, cache_hit, intent_project, files_returned}'
```

### p50 / p95 separado por cache_hit

```bash
jq 'map(select(.event == "chat_turn"))
  | group_by(.cache_hit)
  | map({
      cache_hit: .[0].cache_hit,
      n: length,
      p50_total: (sort_by(.total_ms) | .[length/2 | floor].total_ms),
      p95_total: (sort_by(.total_ms) | .[length*0.95 | floor].total_ms),
      p50_parse: (map(.parse_intent_ms // 0) | sort | .[length/2 | floor]),
      p50_match: (map(.match_folders_ms // 0) | sort | .[length/2 | floor]),
      p50_drive: (map(.search_drive_ms // 0) | sort | .[length/2 | floor])
    })' /tmp/timings.json
```

### Ratio de errores

```bash
jq 'group_by(.event) | map({event: .[0].event, n: length})' /tmp/timings.json
```

### Top 5 turnos más lentos

```bash
jq 'map(select(.event == "chat_turn"))
  | sort_by(-.total_ms) | .[0:5]
  | map({total_ms, cache_hit, intent_project, parse_intent_ms, match_folders_ms, search_drive_ms})' \
  /tmp/timings.json
```

### % del tiempo total que gasta el LLM

```bash
jq 'map(select(.event == "chat_turn"))
  | map((.parse_intent_ms // 0) + (.match_folders_ms // 0) | . / .total_ms * 100)
  | { p50: (sort | .[length/2 | floor]), p95: (sort | .[length*0.95 | floor]) }' \
  /tmp/timings.json
```

Esta última consulta es la que decide **si vale la pena migrar a Haiku**:
si el LLM se come >40% del total típico, Haiku puede dar mejora real. Si
<20%, no vale romper la consistencia con Trebol bot.

---

## Cómo se implementa

Tres piezas en el código:

### 1. `AgentState._timings`

`bot-service/app/agent/state.py`. Campo opcional `dict[str, float]` que
acumula los ms de cada nodo. No se persiste en MongoDB — vive solo
durante la ejecución del grafo.

### 2. Wrapper `_timed` en `graph.py`

```python
def _timed(node_name: str, fn):
    async def wrapped(state):
        t0 = time.perf_counter()
        try:
            result = await fn(state)
        except Exception as e:
            elapsed = round((time.perf_counter() - t0) * 1000, 1)
            print(f"[timing-node-error] node={node_name} ms={elapsed} err={type(e).__name__}: {e}")
            raise
        elapsed = round((time.perf_counter() - t0) * 1000, 1)
        ...
        return {**result, "_timings": {**prev, node_name: elapsed}}
    return wrapped
```

Cada nodo se registra envuelto:
```python
graph.add_node("parse_intent", _timed("parse_intent", parse_intent))
```

### 3. Log final en `chat.py`

Wrappea `agent_graph.ainvoke()` en try/except, mide `total_ms`, y emite
`[timing] {...}` antes de propagar el error (si lo hubo). Garantía de
cobertura 100%: cada request loguea exactamente una línea.

---

## Cómo extender

Si querés agregar un campo nuevo al log (ej. `query_length`, `user_id`,
`drive_files_listed`):

1. Si el dato vive en el state → simplemente leelo en el `timing_log` dict
   de `chat.py`.
2. Si el dato vive en un nodo específico → escríbelo al state desde el
   nodo (ej. `state["files_listed"] = len(files)`) y leélo igual.
3. Si querés un evento nuevo (no un campo) → agregá un `print(f"[X] ...")`
   con un prefijo distinto y crealo grepeable.

**No agregar Sentry/OpenTelemetry/Langfuse** sin pedido explícito — el
log estructurado a stdout es suficiente para el tamaño actual del bot
(<100 queries/día). El día que crezca, evaluamos.

---

## Limitaciones conocidas

- **No hay TTL ni rotación de logs**. `docker logs` está limitado por la
  configuración del daemon (default ~10 MB rolling). Para análisis
  histórico, hay que `docker logs > archivo.log` periódicamente o
  configurar `json-file` driver con rotación más larga.
- **Si el container reinicia, los logs en memoria de Docker quedan**, pero
  los emitidos antes del reinicio pueden perderse según política. Para
  análisis de regresión post-deploy, snapshotear antes.
- **No mide latencia HTTP del frontend al backend** (DNS, TLS handshake,
  Traefik, transferencia). Solo mide adentro del invoke del grafo. Si el
  user reporta lentitud y el `total_ms` está bajo, mirar por afuera.
- **El timing del nodo no incluye lo que pasa antes del primer await**.
  Para los nodos actuales (todos `async def`) la diferencia es despreciable.

---

## Estado

- **2026-05-10**: implementado y desplegado. Cobertura 100% (success +
  error). Pendiente: acumular ~30-50 queries reales para sacar p50/p95
  confiables y decidir Haiku vs gpt-4.1-mini con datos.
