# Command: Diagnose

## Purpose
Systematic root cause analysis for production issues, extending `prime-debug` with SDD integration.

## Read Step
- `Kairos_Brain/contexto-claude/Architecture_Index.md` — System topology
- `Kairos_Brain/infra/System_Map.md` — End-to-end data flow
- `Kairos_Brain/contexto-claude/Engineering_Manifesto.md` — Diagnostic mindset

## Process
1. **Symptom** — What's observed? (e.g., "bot says it's ChatGPT")
2. **Scope** — How many clients affected? Since when?
3. **Health** — Check all services (Docker, n8n, Postgres, Redis, Evolution).
4. **Logs** — Docker logs of relevant container.
5. **Executions** — n8n recent executions (filter by error).
6. **Data** — Inspect chat memory, Redis, MongoDB as needed.
7. **Hypothesis** — Formulate root cause.
8. **Verify** — Confirm with evidence.
9. **Route** —
   - If simple fix (hotfix): execute and document in `docs/decisions/`.
   - If complex fix: create spec with `/new-spec`.

## Common Patterns
- **Bot no responde:** n8n worker → Redis queue → Webhook URL → Chatwoot bot status
- **Responde como ChatGPT:** Chat memory contaminada → limpiar PostgreSQL sessions
- **No encuentra autos:** MongoDB vector search index → verificar sync sheets→mongo
- **Mensajes duplicados:** Redis dedup → verificar TTL y keys
- **Timeout:** Queue mode worker → n8n logs

## Output
- Root cause identified with evidence.
- Fix applied (hotfix) or spec created (complex change).
- Decision documented if systemic issue found.
