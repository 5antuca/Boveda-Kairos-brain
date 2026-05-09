---
tags: [gerstner-studio, drive-assistant, spec, fix, matching, cache, contexto]
fecha: 2026-05-09
estado: PROPUESTO — pendiente implementación
relacionado: [[Drive_Assistant]], [[Spec_Auto_Sync_Drive]], [[Spec_Vision_Analyzer]]
---

# Spec — Fix matching, cache de thumbnails y herencia de contexto

## El problema

Tres bugs encontrados en uso real (2026-05-09) que rompen el value-prop del bot
("encontrá lo que pediste, sin sorpresas"):

| # | Síntoma reportado | Root cause |
|---|---|---|
| **B1** | Pido "más" y vienen fotos que no cargan en el previsualizador | `folder_cache` no chequea `expires_at` (`check_cache.py:14-16`) y los `thumbnailLink` firmados de Drive expiran a ~1h. La 2da query reusa cache "vivo" con URLs muertas → 403 del CDN. |
| **B2** | "singer rally" devuelve fotos del Singer normal, aunque existe carpeta `Gerstner/fotos para ordenar/Singer Rally` | (a) `_list_folders_sync` corta a `depth>6` → carpetas profundas no se indexan. (b) Scoring de `_prefilter` y prompt de `match_folders` priorizan "carpeta raíz del proyecto" sobre "match más específico del path completo". |
| **B3** | "ford mustang" → "singer rally" → busca singer DENTRO de ford | `_get_previous_context` (chat.py:126-152) hereda turnos previos al `parse_intent`. El prompt heredador no descarta contexto cuando el query nuevo menciona un proyecto distinto sin la fórmula "y el X?". `_prefilter` además mezcla `keywords` heredadas con `project_tokens` nuevos → score contaminado. |

### Por qué los tres juntos

Los tres tocan la **misma pipeline** (`parse_intent` → `match_folders` →
`check_cache` → `search_drive` → `generate_response`). Un fix de un solo paso
deja los otros expuestos: si arreglo el cache pero no el matcher, el user
sigue viendo fotos equivocadas; si arreglo el matcher pero no el contexto,
sigue contaminando entre proyectos. Bundle único + deploy atómico.

---

## Diseño técnico

### Fix B1 — Cache de archivos respeta TTL + thumbnails se rebuilden a demanda

**Cambio principal**: `check_cache` ignora cache que cumplió `expires_at`.

```python
# backend/app/agent/nodes/check_cache.py
from datetime import datetime
from app.agent.state import AgentState
from app.database import get_db


async def check_cache(state: AgentState) -> AgentState:
    matched_ids = state.get("matched_folder_ids", [])
    if not matched_ids:
        return {**state, "files": [], "cache_hit": False}

    db = await get_db()
    now = datetime.utcnow()
    all_files: list[dict] = []
    found_any = False

    for folder_id in matched_ids:
        cached = await db.folder_cache.find_one({"folder_id": folder_id})
        if not cached:
            continue
        # Nuevo: chequear expires_at. Si expiró → ignorar y forzar refetch.
        expires = cached.get("expires_at")
        if expires and expires < now:
            continue
        found_any = True
        all_files.extend(cached.get("files", []))

    return {**state, "files": all_files, "cache_hit": found_any}
```

**Cambio complementario**: bajar TTL del cache de archivos a **45 min** (más
chico que la validez del `thumbnailLink` de Drive ≈ 1h, con margen). Esto
garantiza que un cache hit nunca devuelva URLs muertas.

```python
# backend/app/agent/nodes/save_cache.py
CACHE_TTL_MINUTES = 45  # antes: 24 hours
# ...
expires = now + timedelta(minutes=CACHE_TTL_MINUTES)
```

**Por qué no más largo + refresh on-the-fly**: requeriría re-pedir solo la
metadata `thumbnailLink` por archivo (1 call/file = 20-50 calls/query). Más
complejo y no resuelve el caso "user pide más 2 horas después" donde igual
hay que refetchear. 45 min cubre la sesión de uso típica del taller.

**Backstop visual**: si igual queda algún URL muerto (race entre TTL y
sesión larga), agregar al frontend `onerror` por imagen que dispare fetch
del proxy `/api/thumbnail/{file_id}?s=256`. Una línea en el `<img>`:

```jsx
<img
  src={img.thumbnail_url}
  onError={(e) => { e.currentTarget.src = `/api/thumbnail/${img.id}?s=256`; }}
/>
```

Esto convierte un 403 en una recuperación silenciosa via el proxy backend
(que reusa `download_thumbnail` con auth real).

### Fix B2 — Subcarpetas profundas + matching más específico

**(a) Indexer**: subir el límite de recursión a 10 (hoy 6). Loggear cuando
se trunque para detectar carpetas perdidas:

```python
# backend/app/services/drive_service.py — _list_folders_sync
def _list_folders_sync(self, folder_id, path="", depth=0):
    if depth > 10:  # antes: 6
        print(f"[indexer] depth limit hit at {path or folder_id}")
        return []
    # ...resto igual
```

10 es seguro: el Drive del taller hoy no pasa de 4 niveles. Subir a 10 da
margen amplio sin riesgo de loops (Drive no permite ciclos en folders).

**(b) Scoring del prefilter**: premiar **match exacto del query completo
en path** muy fuerte, y penalizar matches parciales que dependen solo del
project_token cuando hay especificadores adicionales en el query.

```python
# backend/app/agent/nodes/match_folders.py — _prefilter
def _prefilter(folders, intent):
    project = _normalize(intent.get("project", ""))
    keywords = [_normalize(k) for k in intent.get("keywords", []) if k]
    raw_query = _normalize(intent.get("raw_query", ""))
    media_type = _normalize(intent.get("media_type", ""))

    project_tokens = [
        t for t in project.split()
        if t and t not in {"general", "el", "la", "de", "del", "los", "las"}
    ]

    if not project_tokens and not keywords:
        sorted_short = sorted(folders, key=lambda f: f.get("depth", 99))
        return sorted_short[:30]

    scored = []
    for f in folders:
        path_norm = _normalize(f.get("path", ""))
        name_norm = _normalize(f.get("name", ""))
        score = 0

        # NUEVO: match del query crudo completo en path → score gigante.
        # Esto hace que "singer rally" matchee la carpeta llamada
        # "Singer Rally" antes que la carpeta "Singer".
        if raw_query and len(raw_query) >= 4 and raw_query in path_norm:
            score += 50

        # NUEVO: match exacto del nombre de carpeta (último segmento) con
        # el query → score alto. Útil para queries de 1 palabra.
        if raw_query and raw_query == name_norm:
            score += 40

        # NUEVO: match del project completo (multi-token) en path
        if len(project_tokens) > 1:
            project_full = " ".join(project_tokens)
            if project_full in path_norm:
                score += 30

        # Match por token individual del proyecto (peso bajado de 10 a 6)
        for tok in project_tokens:
            if len(tok) >= 3 and tok in path_norm:
                score += 6

        # Keywords (peso bajado de 3 a 2 — para evitar contaminación heredada)
        for kw in keywords:
            if len(kw) >= 3 and kw in path_norm:
                score += 2

        if media_type and media_type != "all" and media_type in path_norm:
            score += 5

        # Penalización a profundidad — pero más liviana, no quiero descartar
        # carpetas profundas legítimas
        score -= f.get("depth", 0) * 0.5

        if score > 0:
            scored.append((score, f))

    scored.sort(key=lambda x: -x[0])
    return [f for _, f in scored[:50]]
```

**(c) Prompt de `match_folders`**: explicitar la regla "match más específico
gana sobre match más general":

```python
# backend/app/agent/prompts.py — MATCH_FOLDERS_SYSTEM_PROMPT
MATCH_FOLDERS_SYSTEM_PROMPT = """\
Sos un selector de carpetas para Gerstner Werks. Recibís:
- query del usuario (intención ya parseada)
- lista candidata de carpetas (path completo + folder_id)

Tu tarea: elegir las 1 a 3 carpetas más relevantes.

REGLAS DE PRIORIDAD (en orden):

1. **Match más específico gana**. Si el query es "singer rally" y existen
   tanto "Gerstner/Singer" como "Gerstner/fotos para ordenar/Singer Rally",
   ELEGÍ "Singer Rally" — el match completo gana sobre el parcial.

2. Si el query menciona un proyecto + un calificador (ej. "marketing del
   singer", "rally del singer"), buscá una subcarpeta del proyecto que
   matchee el calificador. Solo caés a la carpeta raíz del proyecto si NO
   existe esa subcarpeta.

3. Si el query es solo el nombre del proyecto (ej. "singer", "bronco"),
   devolvé la carpeta raíz del proyecto.

4. NUNCA devuelvas carpetas que no contengan ningún token del query en su
   path. Si los candidatos no tienen ningún match real, devolvé `[]` y
   `reasoning: "ninguna carpeta candidata matchea el query"`.

5. Máximo 3 carpetas. Si una sola es claramente la mejor, devolvé solo esa.

Respondé SOLO con JSON válido:
{"folder_ids": ["id1", ...], "reasoning": "breve explicación"}
"""
```

### Fix B3 — Herencia de contexto: descartar al cambiar de proyecto

**(a) Prompt de `parse_intent`** — agregar regla explícita "proyecto nuevo
descarta contexto":

```python
# backend/app/agent/prompts.py — INTENT_SYSTEM_PROMPT
INTENT_SYSTEM_PROMPT = """\
Sos un clasificador de consultas para Gerstner Werks, taller de restauración
de autos clásicos de alta gama.

Dado un query del usuario, extraé información en JSON:
{
  "project": "...",          # ver más abajo
  "media_type": "...",
  "format": "...",
  "keywords": [...],
  "is_more_request": boolean,
  "raw_query": "..."
}

CONTEXTO DE CONVERSACIÓN — REGLA DE HERENCIA:

Si hay un bloque "Contexto previo" con turnos anteriores:

1. **Cambio de proyecto = descartar contexto entero**. Si la query nueva
   menciona un proyecto distinto al previo (sea con "y el ...?" o pelado
   tipo "singer rally", "ford bronco", "jaguar"), IGNORÁ por completo el
   contexto previo. NO heredes keywords ni media_type. Tratá la query como
   nueva.

2. **Query parcial sin proyecto = heredar**. Si la query nueva NO menciona
   proyecto y es solo un media_type ("procesos", "motor", "interior") o un
   detalle suelto ("y los asientos?", "techo"), heredá el `project` y
   `keywords` relevantes del último turno con proyecto. Combiná las
   keywords con las nuevas.

3. **Detección de proyecto nuevo**: si la query contiene cualquier palabra
   que sea un nombre de auto/marca conocido (singer, bronco, jaguar, mustang,
   ford, aston martin, porsche, e-type, etc.) → es un proyecto explícito.
   Aplicá regla 1.

4. `raw_query` siempre es la query nueva sin modificar.

Respondé SOLO con JSON válido. Sin markdown.
"""
```

**(b) Salvavidas en `_prefilter`** — si el LLM falla y hereda keywords
contaminadas, mitigar el impacto: cuando `project_tokens` están presentes,
**no usar keywords para gating**, solo para tie-break ya filtrado por
proyecto. Esto se logra ajustando los pesos como en B2 (kw=2 vs project=6+),
pero además agregar guard:

```python
# Después del loop scoring, si TODAS las top 10 carpetas matchean por
# keywords pero NINGUNA por project_tokens → algo mal.
# Filtrar a solo las que matcheen al menos un project_token.
if project_tokens:
    project_filtered = [
        (s, f) for s, f in scored
        if any(t in _normalize(f["path"]) for t in project_tokens if len(t) >= 3)
    ]
    if project_filtered:
        scored = project_filtered
```

Esto garantiza que si el query dice "singer rally", **nunca** caigan
carpetas de "ford" en los candidatos, aunque el LLM haya filtrado mal el
intent. Defensa en profundidad.

**(c) Reducir CONTEXT_TURNS de 3 a 1**: hoy `chat.py:123` hereda los
últimos 3 turnos. Para el caso de uso actual (queries cortas, herencia
solo del turno inmediato anterior), 1 alcanza y reduce drásticamente el
prompt + la chance de contaminación.

```python
# backend/app/routers/chat.py
CONTEXT_TURNS = 1  # antes: 3
```

---

## Plan de ejecución

### Fase 1 — Fix B1 cache (~45 min)
1. `check_cache.py`: chequear `expires_at` antes de devolver cache.
2. `save_cache.py`: bajar `CACHE_TTL` de 24h a 45 min.
3. Frontend `<img>`: agregar `onError` fallback al proxy `/api/thumbnail/`.
4. Test manual:
   - Query nueva → guarda cache → query "más" inmediato → cache hit OK.
   - Forzar `expires_at` viejo en Mongo → cache miss correctamente.
   - Cortar internet, abrir lightbox → fallback dispara y carga via proxy.

### Fase 2 — Fix B2 matching (~1.5h)
1. `drive_service._list_folders_sync`: subir depth limit 6 → 10.
2. Reindexar: `POST /admin/index-drive`. Verificar que aparezca
   `Gerstner/fotos para ordenar/Singer Rally` en `db.folder_tree`.
3. `match_folders._prefilter`: ajustar scoring (raw_query match score=50,
   name_norm exacto score=40, multi-token project score=30, project token
   peso=6, keyword peso=2, depth penalty *0.5).
4. `prompts.MATCH_FOLDERS_SYSTEM_PROMPT`: reescribir con las 5 reglas
   ordenadas.
5. Test golden:
   - "singer rally" → debe matchear `.../Singer Rally`, no `.../Singer`.
   - "singer marketing" → debe matchear subcarpeta marketing si existe.
   - "singer" pelado → carpeta raíz Singer.
   - "fotos del bronco" → carpeta raíz Bronco.

### Fase 3 — Fix B3 herencia de contexto (~1h)
1. `prompts.INTENT_SYSTEM_PROMPT`: agregar regla "cambio de proyecto =
   descartar contexto".
2. `chat.py`: bajar `CONTEXT_TURNS` 3 → 1.
3. `match_folders._prefilter`: agregar guard que filtra candidatos sin
   match de project_token cuando hay project_tokens.
4. Test golden multi-turno:
   - Turno 1: "ford mustang" → matchea Mustang.
   - Turno 2: "singer rally" → matchea Singer Rally, NO debe traer fotos
     de Mustang.
   - Turno 3: "techo" → debe heredar Singer Rally del turno 2.
   - Turno 4: "y el motor del bronco?" → cambio de proyecto, descarta
     contexto.

### Fase 4 — Smoke + deploy (~30 min)
1. `docker compose up -d --build` en VPS.
2. 5-10 queries reales contra prod.
3. Si algo falla, rollback con `git revert`.

**Total**: ~3.5-4 horas. 100% reversible (cada fix es un commit independiente).

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| TTL 45 min causa muchos cache miss y latencia | El miss solo cuesta 1 call a Drive por carpeta (~300-600ms). Aceptable para cubrir el bug. Si molesta, subir a 50 min. |
| Subir depth a 10 hace el indexer más lento | Hoy ~3-5s para 386 carpetas. A 10 niveles, ~5-8s. Sigue siendo aceptable. Solo corre cuando user pega `/admin/index-drive` o (cuando se implemente Spec_Auto_Sync_Drive) cada 15 min. |
| Scoring nuevo rompe queries que hoy funcionan | Test golden ANTES y DESPUÉS con las queries históricas (ver `chat_sessions` Mongo). Ajustar pesos si hay regresión. |
| `CONTEXT_TURNS=1` rompe casos de herencia "encadenada" | Si user dice "singer" → "techo" → "fotos", hoy con 3 turnos hereda singer todo el tiempo. Con 1 turno solo hereda 1 paso. **Aceptable**: el patrón real no encadena más de 2 turnos sin mencionar proyecto de nuevo. Si vemos regresión, subir a 2. |
| Onerror del frontend dispara loops infinitos si proxy también falla | El `onError` solo cambia `src` una vez (Reaccionar maneja la idempotencia). Si el proxy falla, queda un placeholder roto pero no infinite loop. |

---

## Acceptance criteria

- [ ] **B1**: Hago una query, espero 1.5h, pido "más" → fotos cargan OK
  (no 403). Equivalente: forzar `cached_at` viejo en Mongo y verificar
  cache miss.
- [ ] **B1**: Si igual algún URL falla, el `onError` del frontend rescata
  via `/api/thumbnail/`.
- [ ] **B2**: Reindex captura `Singer Rally` (carpeta de profundidad >6)
  en `folder_tree`.
- [ ] **B2**: Query "singer rally" → matchea folder cuya `path` termina en
  "Singer Rally", NO la carpeta raíz "Singer".
- [ ] **B2**: Query "singer marketing" → matchea subcarpeta marketing si
  existe; si no, cae a Singer raíz con `reasoning` indicándolo.
- [ ] **B3**: Secuencia "ford mustang" → "singer rally" devuelve fotos
  de Singer Rally **sin** ninguna foto de Mustang.
- [ ] **B3**: Secuencia "singer rally" → "techo" heredá Singer Rally
  (no busca techo en el último Mustang).
- [ ] **B3**: Hard guard del `_prefilter`: aunque el LLM mande keywords
  contaminadas, las carpetas finales siempre contienen al menos un
  `project_token` del query nuevo.
- [ ] No hay regresión visible en queries golden ("interior del singer",
  "motor del jaguar", "proceso del bronco").

---

## Backlog futuro (NO en esta spec)

- **Reindex automático** — cubierto en [[Spec_Auto_Sync_Drive]]. Una vez
  implementado, B2(a) deja de requerir trigger manual cuando suben nuevas
  carpetas.
- **Vision para filtros por color** — cubierto en [[Spec_Vision_Analyzer]]
  approach C (pre-tag liviano). Resuelve el problema #4 reportado el
  2026-05-09 ("reconocer algunas imágenes para filtrar por color").
- **Re-firmado de thumbnails al vuelo** — si TTL 45 min queda corto en
  uso real, implementar endpoint que re-firme `thumbnailLink` por batch
  de file_ids sin re-listar la carpeta entera. Requeriría guardar
  `cached_at` por archivo, no solo por carpeta.
- **Detección de proyectos via lista canónica** — hoy `parse_intent`
  detecta proyecto por LLM. Si la lista de proyectos se estabiliza (Singer,
  Bronco, Jaguar, Mustang, Aston, Porsche, etc.), un regex pre-LLM puede
  marcar `is_explicit_project=true` y forzar descarte de contexto sin
  depender del prompt.
- **Telemetría de matching** — guardar en Mongo `match_log` cada query
  con: query, intent parseado, candidates pre-filter, candidate elegido
  por LLM, cache_hit. Permitiría analizar drift y tunear scoring/prompt
  con datos reales.

---

## Estado

- **2026-05-09**: spec escrita. Trigger: feedback del usuario en uso real
  identificando 3 bugs interrelacionados (#1 thumbnails muertos al pedir
  "más", #2 subcarpeta "Singer Rally" no matcheada, #3 contaminación
  cross-proyecto en queries multi-turno). Pendiente implementación.
