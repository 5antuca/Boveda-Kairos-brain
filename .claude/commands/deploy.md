# Command: Deploy

## Purpose
Execute the full deployment cycle for an approved spec: plan → review → execute → verify → document.

## Read Step
- The approved spec (path provided by user).
- `.claude/docs/decisions/PLAN.md` — Current plan state.
- `Kairos_Brain/contexto-claude/Architecture_Index.md` — Current state.
- `Kairos_Brain/contexto-claude/Rules_n8n.md` — Deployment rules.

## Process
1. **Validate** spec exists and has status ✅ Aprobada.
2. **Plan** — Use `architecture-expert` agent to generate execution plan in `.claude/docs/decisions/PLAN.md`.
3. **Review** — Use `reviewer` agent to validate the plan.
4. **Execute** — Use `deploy-executor` agent to run step by step, logging in PLAN.md.
5. **Verify** — Use `reviewer` agent to confirm post-deploy health, writing in PLAN.md.
6. **Document** — Update `README.md` and `Kairos_Brain/contexto-claude/Architecture_Index.md` (OBLIGATORIO).
7. **Archive** — Rename PLAN.md to `PLAN-YYYY-MM-DD-descripcion.md` in same folder.

## Output
- Changes applied to test/prod.
- Documentation updated.
- Deploy log in the spec file.
