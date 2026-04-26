---
tags: [sesion, langgraph, sales-swarm, gemini, groq, optimization, trebol]
fecha: 2026-04-25
fecha_cierre: 2026-04-26
duracion: ~6h en 2 días
estado: F1 deployada en test
---

# Sesión 2026-04-25/26 — Supreme Sales Swarm + Migración LLM + Optimización

Sesión densa que tocó 4 ejes:
1. Diseño e implementación del **Supreme Sales Swarm Fase 1** (Profiler psicográfico).
2. Migración del provider LLM cognitivo: OpenAI (cliente) → Gemini → Groq.
3. Bug hunting con tráfico real WhatsApp (saludo, techo USD, RAG, inventario).
4. **Optimización agresiva de tokens** (30K → 12-15K por turno).

---

## 1. Supreme Sales Swarm — Diseño y Fase 1

### Arquitectura objetivo (target final, post F4)

```
START → pre_guard → load_state → profiler_node → specialist_node ↔ tool_node
                                                       ↓
                                                  closer_node → respond_node → END
```

### Spec completa
[[../../specs/2026-04-25-supreme-sales-swarm.md|specs/2026-04-25-supreme-sales-swarm.md]]
(No editar — fuente de verdad de la arquitectura.)

### Lo que se decidió con el usuario
- **3 perfiles** (no 5): `EXPLORADOR` (default), `WORK_MACHINE` (racional/ROI), `PASSION_DRIVE` (emocional/FOMO).
- **Objetivo único del Closer**: derivar a admin rápido y humano (no cerrar venta).
- **Tools nuevas en MVP**: `reservar_unidad` y `cotizar_permuta_express` (pendiente F3).
- **Toggle simple ON/OFF** (no A/B): `SUPREME_SWARM_ENABLED`.
- **Solo Trébol** en F1-F5; MV/Fangio entran después por override de prompts.

### Frase canónica de handoff (acordada con usuario)
- **En horario** (Lun-Vie 9-18, Sáb 9-13 hora Argentina): *"Listo, ya le pasé todo a administración. En breves te van a contactar."*
- **Fuera de horario**: *"Listo, ya le pasé todo a administración. Apenas lo vean te van a contactar."*

Sin nombre propio (ej: "Marina"), sin "experto", sin "no repetís nada" — todo eso suena armado/cursi para tono rioplatense.

### Lo que se implementó (F1 — code en disco + deployed test)

| Archivo | Cambio |
|---|---|
| `bot-service/trebol_bot/agent/profiler.py` | NUEVO. Clasificador `BuyerPersonaProfile` con structured output. Render del bloque PSICOPERFIL para inyectar al prompt. |
| `bot-service/trebol_bot/agent/state.py` | + `merge_persona_into_crm()` con sticky preserve (confianza ≥ 0.7 no se sobrescribe). |
| `bot-service/trebol_bot/agent/graph.py` | + `psicoperfil_bloque` en `AgentState`. Bloque `if settings.supreme_swarm_enabled:` antes del invoke. + `techo_usd_actual` en state, inyectado por tool_node si LLM se olvida del filtro. + fix de saludo (chequea AIMessage previo, no `len(past_messages)==0`). |
| `bot-service/trebol_bot/agent/prompts.py` | `load_system_prompt()` acepta `psicoperfil_bloque`. |
| `bot-service/trebol_bot/config.py` | + toggle `supreme_swarm_enabled` (default false), `sticky_threshold=0.7`. |
| `bot-service/configs/prompts/trebol.txt` | + placeholder `{PSICOPERFIL_BLOQUE}` después de `{ESTADO_CALIFICACION}`. |
| `environments/test/trebol/.env` | `SUPREME_SWARM_ENABLED=true` |

Resultado tests sintéticos:
- WORK_MACHINE → 0.95 confianza ("factura A", "renovar la flota", "leasing bancario")
- PASSION_DRIVE → 0.95 confianza ("DS3 turbo", "me re enamoré", "lo busco hace meses")
- EXPLORADOR → 0.90 confianza ("saludo", "pregunta genérica")

### Roadmap pendiente
- [ ] **F2** — Soak test 1 semana con tráfico real, accuracy ≥ 85% sobre 50 conversaciones etiquetadas.
- [ ] **F3** — Specialists separados con tool whitelist + `reservar_unidad` + `cotizar_permuta_express`.
- [ ] **F4** — `closer_node` + Dossier para admin + helper `is_business_hours(client_id)` + alerta `vip_handoff`.
- [ ] **F5** — Cutover test 100% + soak.
- [ ] **F6** — Cutover prod (canary, solo con aprobación explícita del usuario).

---

## 2. Migración LLM provider

### Recorrido de proveedores
1. **OpenAI** (key del cliente Trébol) — funciona pero no es nuestra. Quita autonomía.
2. **Gemini 2.5 Flash** — clasificó perfecto en tests sintéticos, pero **free tier real es 250 RPD / 100K TPD**. Pega cuota en 3-4 turnos seguidos.
3. **Gemini 2.0 Flash / Lite** — `limit: 0` (free tier deshabilitado en proyectos nuevos).
4. **Groq Llama 3.3 70B** — **elegido**. Free 14.400 RPD, ~700 tok/s, fuerte tool calling.

### Estado actual (2026-04-26)
| Componente | Provider | Modelo |
|---|---|---|
| Agent principal | Groq | `llama-3.3-70b-versatile` |
| Profiler (Sales Swarm) | Groq | `llama-3.1-8b-instant` (cuota separada) |
| CRM extractor async | Groq | `llama-3.3-70b-versatile` |
| Vector embeddings (MongoDB) | OpenAI (key cliente) | `text-embedding-3-small` |
| Whisper (audio) | OpenAI (key cliente) | `whisper-1` |

Detalles en [[LLM_Providers]].

### Code changes
- `bot-service/trebol_bot/llm.py` — **NUEVO** factory `make_llm()` con soporte groq/gemini/openai.
- `bot-service/trebol_bot/agent/graph.py` — `_make_llm()` delega en factory. `RateLimitError` reemplazado por `is_rate_limit_error()` (cubre OpenAI + Gemini + Groq).
- `bot-service/requirements.txt` — + `langchain-groq==0.2.3`, + `langchain-google-genai==2.0.7`.
- `environments/test/trebol/docker-compose.yml` — wireado `LLM_PROVIDER`, `GROQ_API_KEY`, `GEMINI_API_KEY`.
- `bot-service/trebol_bot/integrations/openai_quota_fallback.py` — el guard ahora chequea `LLM_PROVIDER==openai` antes de mandar alerta. Para Gemini/Groq hay `llm_quota_exhausted_silent` (warning sin notificación al grupo).

### Por qué la alerta del cliente saltó al grupo
La key OpenAI del cliente da 429 cuando se acaba la cuota → `handle_openai_quota_error()` mandaba al grupo de WhatsApp test. Cuando migré la detección de errores a `is_rate_limit_error()` (que cubre Gemini también), el handler seguía mandando alerta diciendo "openai_quota" aunque el problema era Gemini. **Fixed**: el alert solo se manda si `LLM_PROVIDER==openai`. Para otros providers, silencio + log.

### Comando útil — borrar flag de quota Redis (evita recovery alert)
```bash
PASS=$(grep '^REDIS_PASSWORD' /root/kairos-infrastructure/environments/test/trebol/.env | cut -d= -f2)
docker exec trebol-test-redis redis-cli --no-auth-warning -a "$PASS" DEL "bot:trebol:openai_quota_alert_sent"
```

---

## 3. Bug hunting con tráfico real WhatsApp

### Bug 1 — Saludo no se inyectaba en primer turno
**Causa raíz**: el debounce guarda los mensajes humanos en historial antes de que el bot responda. El check `len(past_messages) == 0` daba False (había 2 humanos en cola).

**Fix** (graph.py line ~819):
```python
es_primer_turno = not any(
    m.__class__.__name__ in ("AIMessage", "AIMessageChunk")
    for m in past_messages
)
```
Ahora chequea si el bot ya respondió al menos una vez, no la longitud del historial.

### Bug 2 — LLM ignoraba `techo_usd` al llamar tool
Gemini 2.5 Flash llamaba `buscar_inventario_autos(query="autos")` sin pasar el `techo_usd` aunque el CRM lo tenía persistido.

**Fix determinístico** (graph.py `tool_node`): Python intercepta el tool call y inyecta `techo_usd` desde `state["techo_usd_actual"]` si el LLM no lo pasó. Patrón "trust but verify".

Llama 3.3 70B obedece mejor — el fix queda como red de seguridad.

### Bug 3 — Bot ofrecía motos como "auto"
**Causa raíz #1**: el bot apuntaba a colección MongoDB `propiedades` con 6 docs basura (sin autos). Le borraron al Sheet la columna ID que usa el sync, dejó la colección rota.
**Causa raíz #2**: la tool `buscar_inventario_autos` no filtraba por `TIPO`.

**Fixes**:
- `bot-service/configs/trebol.yaml` → `mongo_collection: propiedades-test` (59 docs reales con autos).
- Tool agregó parámetro `tipo_vehiculo` con alias coloquiales (auto/moto/camión/etc → tipos canónicos `Vehiculo`, `Moto`, `Camion`, `Maquinaria`, `Acuatico`).
- Mensaje fallback claro cuando no hay nada del tipo pedido: "No tenemos [tipo] en tu rango. NO ofrezcas otro tipo como reemplazo."

Ver [[../Trebol/SheetsToMongo_RAG_Inventario|SheetsToMongo_RAG_Inventario]] para detalles del inventory.

### Bug 4 — DESC duplicado en MongoDB rompía el ROI de tokens
Algunos docs vienen con el campo `DESC` repetido N veces sin separador:
```
"gris, 5 puertas, unico dueño, transmision manual gris, 5 puertas, unico dueño, transmision manualgris..."
```
Causa: bug del workflow `SheetsToMongo v2` (n8n).

**Fix workaround** (no toca el sync, solo el rendering): `_dedupe_repeated_text()` en `tools.py` busca el período mínimo del texto y devuelve solo la primera ocurrencia. Resultado: 200 chars → 28 chars en docs afectados (-86%).

---

## 4. Optimización de tokens — 30K → 12K por turno

Ver detalles completos en [[Token_Optimization]].

### Resumen
| Componente | Original | Final | Ahorro |
|---|---:|---:|---:|
| System prompt | 8.061 | 3.498 | -57% |
| Tool result (4 fichas) | 1.500 | 1.389 | -7%* |
| **Overhead fijo por LLM call** | **10.235** | **5.561** | **-45%** |

\* El ahorro chico en fichas es porque solo 1/4 docs tiene DESC corrupto. En docs afectados: -86%.

Plus optimizaciones que no se ven en tabla:
- **CRM extractor guard**: skipea ~30-40% de turnos triviales.
- **Profiler con `llama-3.1-8b-instant`** (cuota separada en Groq, ~10x más barato que el 70B).

### Comparativa contra benchmark profesional
| Tier | Tokens/turn |
|---|---:|
| Customer support simple | ~1.000 |
| AI sales agent (objetivo profesional) | 5.000-10.000 |
| **Trébol antes** | ~30.000 |
| **Trébol ahora** | **~12.000-15.000** |

---

## 5. Hallazgos clave (rescatables para futuro)

### Sobre Gemini free tier (warning)
- **2.5 Flash free**: 250 RPD, 10 RPM, **100K TPD** ← bottleneck real.
- **2.0 Flash y 2.0 Flash Lite**: free tier DESHABILITADO en proyectos nuevos (`limit: 0`).
- Para uso real necesitás paid tier.

### Sobre Groq free tier
- Llama 3.3 70B: 30 RPM, 14.400 RPD, **100K TPD**.
- Llama 3.1 8B Instant: cuota SEPARADA (perfecto para Profiler).
- Reset: 24h rolling window por modelo.
- Paid Dev Tier ~$0.59/MTok input → para Trébol prod: ~$2/mes.

### Sobre System prompts grandes
Trébol tenía 365 líneas / 8K tokens. Patrones identificados de bloat:
- Repeticiones del mismo concepto en 3 formas distintas
- Ejemplos verbosos cuando la regla ya estaba clara
- Listas extensas de palabras prohibidas/permitidas
- Casos edge muy específicos
- Muchos marcadores visuales `⸻`

Comprimimos a 3.5K manteniendo TODAS las reglas duras (anti-alucinación, voseo, derivación, frase canónica handoff). Backup en `bot-service/configs/prompts/trebol.txt.bak-pre-compress-2026-04-26`.

### Sobre el workflow de `docker compose`
- Si tenés env vars del shell con el mismo nombre que las del `.env` del compose, **el shell gana**. `unset GEMINI_API_KEY` antes de `docker compose up` para forzar lectura del archivo.
- `docker compose up -d` con `--no-deps` no recrea el container si la config no cambió. Usar `--force-recreate`.
- Cambios en archivos `.py` requieren rebuild (no es bind mount). Cambios en `.env` requieren restart pero no rebuild. Cambios en `configs/*.yaml` requieren rebuild.

### Sobre tool calling con LLMs distintos
- **GPT-4.1-mini**: muy obediente con tool args, sigue instrucciones del prompt al pie.
- **Gemini 2.5 Flash**: a veces "olvida" args contextuales (ej: techo_usd). Necesita inyección determinística en Python.
- **Llama 3.3 70B (Groq)**: balance bueno — obedece tool args y es rápido. Mejor que Gemini en obediencia.

---

## Links

- [[LangGraph_Bot]] — proyecto principal
- [[Supreme_Sales_Swarm]] — estado del enjambre
- [[LLM_Providers]] — strategy de providers
- [[Token_Optimization]] — métricas y técnicas
- [[OpenAI_Quota_Fallback]] — runbook (alerta solo cuando provider=openai)
- [[Sesion_2026-04-17_Bugs_y_Observabilidad]] — sesión anterior
- [[../Trebol/SheetsToMongo_RAG_Inventario]] — colección + bug DESC
