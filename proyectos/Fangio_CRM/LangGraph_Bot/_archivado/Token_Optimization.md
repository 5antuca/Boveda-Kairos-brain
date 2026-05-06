---
tags: [optimization, tokens, prompt-engineering, costos, trebol]
fecha: 2026-04-26
estado: F1+A+B implementado en test
---

# Token Optimization — del bloat al benchmark profesional

Documenta el trabajo de compresión hecho el 2026-04-26 sobre el bot Trébol. Bajamos de **~30K tokens/turn → ~12-15K** (-50%+), acercándonos al benchmark profesional de "AI sales agent con RAG" (5-10K tok/turn).

## Métricas medidas

### Overhead fijo por LLM call

| Componente | Original | Final | Ahorro |
|---|---:|---:|---:|
| System prompt | 8.061 | 3.498 | -57% |
| Tool defs | 674 | 674 | 0% |
| Tool result (4 fichas) | 1.500 | 1.389 | -7%* |
| **Total overhead** | **10.235** | **5.561** | **-45%** |

\* En docs con DESC corrupto el ahorro es -86% (200 → 28 chars individual).

### Estimación tokens/turno por escenario

| Tipo de turno | Antes | Ahora |
|---|---:|---:|
| Saludo trivial ("ok", "gracias") | ~28K | **~5K** (skip CRM) |
| Charla inicial sin tool | ~25K | **~10K** |
| Búsqueda con 1 tool | ~30K | **~15K** |
| Búsqueda + cuotas (2 tools) | ~40K | **~20K** |

**Promedio mix de tráfico real**: ~12-15K tokens/turn.

## Comparativa contra benchmarks de la industria (2026)

| Tier | Tokens/turn |
|---|---:|
| Customer support simple | ~1.000 |
| AI SDR outreach | 3.000-4.000 |
| **AI sales agent con RAG (objetivo)** | **5.000-10.000** |
| Multi-step automation con CoT | 5.000+ |
| **Trébol original** | ~30.000 |
| **Trébol post optimización** | **~12-15K** |

Sources:
- [iternal.ai/token-usage-guide](https://iternal.ai/token-usage-guide)
- [Microsoft LLMLingua repo](https://github.com/microsoft/LLMLingua)
- [Prompt Compression Survey arxiv 2024](https://arxiv.org/abs/2410.12388)

## Optimizaciones implementadas

### A.1) System prompt comprimido (-57%)
- Original: 365 líneas, 8.061 tokens.
- Final: ~200 líneas, 3.498 tokens.
- Backup: `bot-service/configs/prompts/trebol.txt.bak-pre-compress-2026-04-26`.

Patrones de bloat identificados y eliminados:
- Repeticiones del mismo concepto en 3 formas distintas
- Ejemplos verbosos cuando la regla ya estaba clara
- Listas extensas de palabras prohibidas/permitidas (mantener 3-4 ejemplos representativos)
- Casos edge muy específicos (mantener solo los que disparan bugs reales documentados)
- Marcadores visuales `⸻` (no aportan, ocupan tokens)

Reglas duras MANTENIDAS al 100%: anti-alucinación, voseo rioplatense, derivación a admin, frase canónica handoff, casos edge que vienen de bugs documentados (Jeep Compass, DS3 anticipo, etc.), JSON output, prohibiciones de teléfono/contactos.

### A.2) DESC dedupe en `_format_ficha`
Bug del sync `SheetsToMongo v2`: el campo `DESC` viene con la frase repetida N veces sin separador.

```
Original (200 chars):
"gris, 5 puertas, unico dueño, transmision manual gris, 5 puertas, unico dueño, transmision manualgris, 5 puertas..."

Después de _dedupe_repeated_text (28 chars):
"gris, 5 puertas, unico dueño"
```

Algoritmo (`bot-service/trebol_bot/agent/tools.py::_dedupe_repeated_text`):
1. Normalizar texto (sin whitespace, lowercase) → `text_norm`.
2. Buscar el chunk más corto de ≥20 chars que aparezca 2+ veces en `text_norm`.
3. Mapear esa longitud al texto original (contando chars no-whitespace).
4. Extender hasta el próximo separador para no cortar palabras.
5. Devolver el texto recortado.

Plus: truncación a 120 chars + extensión hasta separador.

### A.3) Profiler con modelo más chico
Cambio en `agent/profiler.py`: el Profiler usa `llama-3.1-8b-instant` (override del default 70B).

Razones:
- Clasificación es task simple, no necesita 70B.
- 5x más rápido y consume menos tokens.
- **Cuota separada en Groq** (500K TPD el 8B vs 100K TPD el 70B) → libera capacity del agent.

```python
# bot-service/trebol_bot/agent/profiler.py
profiler_model = None
if (settings.llm_provider or "").lower() == "groq":
    profiler_model = "llama-3.1-8b-instant"

llm = make_llm(client_id=client_id, temperature=0.0, model_override=profiler_model)
```

### B.1) CRM extractor guard
El extractor LLM corre en background después de cada turno. Antes corría SIEMPRE (~1.500 tokens/turn extra).

Heurística (`agent/crm.py::should_run_crm_extractor`):
- **Skip si**: bot devolvió silencio Y mensaje del cliente es trivial (≤4 palabras sin keywords CRM).
- **Correr si**: cliente menciona keywords (nombre, plata, "me interesa", permuta, etc.) o bot dijo frase de handoff.

Trigger keywords (regex): `me llamo`, `soy`, `mi nombre es`, números (`\d{4,}`), `millones`, `palos`, `u$s/usd/dólar`, `me interesa`, `me lo llev`, `quiero (ese|comprar)`, `tengo (un|una)`, `para entregar`, `papel`, `trámite`, `foto`, `cuotas`, `financ`, `confirm`, `coordin`, `reservar`.

Ahorro: **30-40% de turnos saltan el extractor** → ~600 tokens/turn promedio.

### Sticky Profiler (ya implementado en F1)
Una vez clasificado con confianza ≥ 0.7, el Profiler NO se invoca de nuevo — reutiliza el perfil desde CRM.
Ahorro: ~500 tokens en turnos siguientes (reduce de 3 LLM calls a 2).

### Inyección determinística de `techo_usd`
`tool_node` en `graph.py` inyecta `techo_usd` desde el state si el LLM no lo pasó al tool call. No reduce tokens directamente pero evita búsquedas inválidas que requerirían un retry.

## Optimizaciones pendientes (si querés bajar a 8-10K)

### C) Skip 2da agent call cuando hay tool result claro
Hoy cada tool call hace 2 LLM calls (decide tool → ejecuta → re-llama LLM con result). Para respuestas determinísticas (ficha + cierre fijo) podríamos format directamente.
- **Ahorro**: ~6.000 tok/turn (en turnos con tools).
- **Riesgo**: alto. Cambia arquitectura del LangGraph.

### D) Comprimir prompt aún más a ~2.5K
- Eliminar el ejemplo final del prompt
- Reducir más las listas de palabras
- Consolidar reglas similares
- **Ahorro**: ~1.000 tok/turn.
- **Riesgo**: medio. Hay que validar comportamiento con harness antes/después.

### E) Anthropic prompt caching (no aplica a Groq)
Si en el futuro migramos a Anthropic Sonnet, su feature de prompt caching reduce 90% el costo del system prompt en turnos siguientes.

## Cómo medir tokens en producción

```bash
docker exec trebol-test-bot python -c "
import tiktoken
enc = tiktoken.get_encoding('cl100k_base')
with open('/app/configs/prompts/trebol.txt') as f:
    print(f'system_prompt: {len(enc.encode(f.read()))} tokens')
"
```

Para tokens reales por turno: revisar Langfuse traces (https://us.cloud.langfuse.com), cada `agent_run` tiene `input_tokens` + `output_tokens` por LLM call.

## Capacity actual con Groq free

Con ~12K tok/turn y free tier Llama 3.3 70B (100K TPD):
- **~8 turnos completos por día** (con tools).
- **~20 turnos sin tools** (saludos, charlas).
- **Plus** Profiler usa cuota separada (500K TPD del 8B) → no contribuye al límite del agent.

Para producción real (~600 turnos/día), upgrade a Groq Dev Tier ($2/mes).

## Links

- [[LLM_Providers]] — qué provider usa cada componente
- [[Sesion_2026-04-25_Sales_Swarm_y_LLM_Migration]] — historia de la optimización
- [[Supreme_Sales_Swarm]] — impacto en arquitectura cognitiva
- Backup prompt original: `bot-service/configs/prompts/trebol.txt.bak-pre-compress-2026-04-26`
