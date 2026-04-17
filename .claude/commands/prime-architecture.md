# Command: Prime Architecture

## Purpose
Analyze the current system architecture, identify bottlenecks, and ensure multi-tenant scalability.

## Read Step
- `.claude/CLAUDE.md`
- Root directory structure (`ls -R`)
- Core infrastructure files (e.g., `docker-compose.yml`, `package.json`)
- Environment variable templates (`.env.example`)

## Analysis
1. **Multi-tenancy:** Evaluate how client data is isolated.
2. **Scalability:** Assess queue management and resource allocation.
3. **Security:** Check for hardcoded secrets or permissive access.
4. **Integration:** Review connections between Evolution API, n8n, and MongoDB.

## Report Format
- **Current State:** Brief summary of the stack and flow.
- **Architectural Risks:** Bulleted list of critical issues.
- **Optimization Roadmap:** Short-term and long-term improvements.
- **Decision Log:** Rationale for proposed changes.
