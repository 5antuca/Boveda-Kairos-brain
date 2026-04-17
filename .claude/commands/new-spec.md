# Command: New Spec

## Purpose
Create a structured spec for an infrastructure, workflow, or prompt change using the SDD methodology.

## Read Step
- `Kairos_Brain/contexto-claude/Architecture_Index.md` — Current system state
- `Kairos_Brain/infra/Roadmap.md` — Active priorities
- `specs/templates/` — Available templates

## Process
1. Determine spec type from the request:
   - Workflow change → `specs/templates/workflow-change.md`
   - Infrastructure change → `specs/templates/infra-change.md`
   - Prompt change → `specs/templates/prompt-change.md`
   - New integration → `specs/templates/new-integration.md`
2. Use the `spec-analyst` agent to analyze the requirement.
3. Fill in the template with: Context, Objective, Changes, Acceptance Criteria, Risks.
4. Save as `specs/YYYY-MM-DD-nombre-descriptivo.md`.

## Output
- Spec file ready for review.
- Spec must be self-contained and actionable.
