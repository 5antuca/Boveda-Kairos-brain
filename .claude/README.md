# Claude R&D Framework (Reduce & Delegate)

This directory implements a context-engineering architecture optimized for Claude as an intelligence layer.

## The Framework
- **Reduce:** Minimize the primary context (`CLAUDE.md`) to essential rules and stack information. This avoids noise and token waste during routine tasks.
- **Delegate:** Use specialized "Prime" commands and "Agent" profiles to handle deep technical dives or specific domain expertise.

## Core Components
- **`CLAUDE.md`**: The source of truth for all sessions. Must remain under 50 lines. It defines the project identity and operational guardrails.
- **`commands/`**: Operational priming files. Use these when starting a session oriented towards a specific goal (e.g., debugging or architectural review).
- **`agents/`**: Domain-specific personas. Reference these when you need deep expertise in n8n, AI integration, or backend architecture.
- **`bundles/`**: Ready-to-inject context packages for specific features (e.g., a "WhatsApp integration" bundle).

## Usage Best Practices
1. **Starting a Session:** Reference `CLAUDE.md` immediately. For specific tasks, say: "Using the `prime-architecture` command, evaluate..."
2. **Avoiding Overload:** Do not load all agent files at once. Only provide the agent profile relevant to the current problem.
3. **Scaling:** When a new complex domain emerges, create a new file in `agents/`. When a routine task becomes common, automate it with a new `command/`.
4. **Minimalism:** Prioritize small, incremental improvements. Claude works best with surgery, not amputations.

## Why this setup?
This architecture prevents "Context Drift" where the model loses track of core project rules due to an overwhelming amount of project documentation. It forces a "Just-In-Time" context loading strategy.
