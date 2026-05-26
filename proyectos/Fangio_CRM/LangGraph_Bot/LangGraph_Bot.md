---
tags: [proyecto, langgraph, fangiocrm, bot, indice]
fecha_inicio: 2026-04-16
ultima_actualizacion: 2026-05-01
estado: vigente — branch operativa `bot-rollback-2026-04-18`
---

# LangGraph Bot — Índice del proyecto

Servicio Python con LangGraph que sirve hoy de motor de respuestas WhatsApp para Trebol/test y va a ser **el agente de respuestas de FangioBot** desde acá en adelante.

## Estado actual (2026-05-01)

- **Branch**: `bot-rollback-2026-04-18` (basada en `7f1e5c2`, cutover prod del 18-abril).
- **Cliente activo**: Trebol/test (`Autos Norte`, ubicación ficticia Olivos). Trebol/prod apagado desde 2026-04-26.
- **Identidad**: agente de respuestas multi-tenant para FangioBot. Trebol queda como tenant test/de referencia.
- **LLM**: OpenAI `gpt-4.1-mini` directo (sin factory multi-provider).
- **Pipeline**: webhook Chatwoot → debounce → LangGraph (agent + tools) → send Chatwoot → CRM async.

Para detalles técnicos completos, leer **[[Pipeline_Estructura]]** — es la fuente de verdad.

## Documentos vigentes

- [[Pipeline_Estructura]] — **canónico técnico**: pipeline end-to-end, state, tools, memoria Redis, estructura de archivos, comandos.
- [[Operar_Bot]] — operativa día a día (logs, restart, troubleshooting).
- [[Observabilidad_Langfuse]] — cómo leer traces y debuggear turnos.
- [[Onboarding_Nuevo_Cliente]] — checklist para sumar un tenant.
- [[Prod_Deploy]] — proceso de deploy a producción.
- [[Conversaciones_Ideales]] — few-shot ejemplos de tono (referencia, no auto-aplicado).
- [[Vision_Classifier]] — clasificación de imágenes WhatsApp con gpt-4.1-mini (separación OCR visual / decisión de intent).

## Documentos archivados (histórico)

Ver [[_archivado/README]] — Sales Swarm, principios canónicos v1/v2, multi-LLM, optimizaciones de tokens, sesiones del 17 y 25-abril. Quedaron obsoletos con el rollback del 1-mayo.

## Decisiones arquitectónicas vigentes

1. **OpenAI directo** — sin factory multi-provider. Si en el futuro hace falta cambiar de modelo, se abre nuevamente la discusión, pero hoy la simplicidad pesa más.
2. **3 tools del LLM** — `buscar_inventario_autos`, `calcular_cuotas`, `opciones_financiacion`. Ampliar tools requiere análisis de tradeoff (ver Pipeline_Estructura §12 para qué NO tiene el agente).
3. **Multi-tenant via ContextVar `current_client_id`** — propagación sin params explícitos.
4. **CRM extractor async** — fire-and-forget post-respuesta, no bloquea latencia del bot.
5. **System prompt en archivo plano** — `configs/prompts/{client_id}.txt`, edit + restart sin rebuild.

## Próximos pasos abiertos (sin priorizar)

- Roadmap de mejoras técnicas (a definir por el usuario desde este punto).
- Multi-tenant real para FangioBot (parametrizar prompt con `{NOMBRE_AGENCIA}`, `{UBICACION}`, etc.).
- Eval suite (no hay tests automáticos del agente actual).
- Sincronía bot ↔ admin tras handoff (alertas, dossier).

## Repo y rutas

| Capa | Path |
|---|---|
| Código fuente | `bot-service/` (Dockerfile + Python) |
| Config Trebol | `bot-service/configs/trebol.yaml` |
| Prompt Trebol | `bot-service/configs/prompts/trebol.txt` |
| Container test | `trebol-test-bot` (Docker Compose, `environments/test/trebol/`) |
| Endpoint público | `https://test-trebol.bot.kairosaisolutions.com` |
| Webhook Chatwoot | `POST /webhook/chatwoot` |
