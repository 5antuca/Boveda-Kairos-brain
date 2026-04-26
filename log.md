# Operation Log

## [2026-04-26] sesion | Supreme Sales Swarm F1 + LLM migration + Token optimization
- Diseño e implementación de Sales Swarm Fase 1: Profiler psicográfico (3 perfiles: EXPLORADOR/WORK_MACHINE/PASSION_DRIVE).
- Migración del provider cognitivo: OpenAI (key cliente) → Gemini → **Groq** (Llama 3.3 70B free 14.4k RPD).
- Optimización agresiva de tokens: ~30K → ~12-15K por turno (-50%+).
- Bug hunting con tráfico WhatsApp real: saludo no se inyectaba (fix), techo USD ignorado (fix determinístico), bot ofrecía motos como autos (colección MongoDB rota + filtro por TIPO).
- Ajustes en `bot-service/`: nuevo factory `llm.py`, `agent/profiler.py`, prompt comprimido 8K→3.5K, `_dedupe_repeated_text` para fix DESC corrupto, CRM extractor guard.
- Frase canónica handoff acordada con usuario (rioplatense, sin nombre propio, variante por horario).
- Páginas creadas: [[proyectos/LangGraph_Bot/Supreme_Sales_Swarm]], [[proyectos/LangGraph_Bot/LLM_Providers]], [[proyectos/LangGraph_Bot/Token_Optimization]], [[proyectos/LangGraph_Bot/Sesion_2026-04-25_Sales_Swarm_y_LLM_Migration]].
- Páginas actualizadas: [[proyectos/LangGraph_Bot/LangGraph_Bot]] (Fase 11), [[proyectos/Trebol/SheetsToMongo_RAG_Inventario]] (estado colecciones + bug DESC), [[index]].
- Spec fuente: `specs/2026-04-25-supreme-sales-swarm.md`.

## [2026-04-25] ingest | Roadmap VPS Legacy
- Procesado archivo `raw/roadmap_vps_legacy.md`.
- Extraída historia de refactorización Trebol v3/v4.
- Actualizados `infra/Roadmap.md` y `proyectos/Trebol_Bot.md`.
