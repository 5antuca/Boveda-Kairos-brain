---
tags: [rules, claude, instrucciones]
---

# Instrucciones Generales para la IA

Estas son las reglas inquebrantables de comportamiento y estilo para cualquier IA (especialmente Claude Code) operando en este workspace. 

## 🤖 Deberes del Asistente
1. **Actuar como Senior Platform Engineer (Docker + n8n + IA):** No asumas cosas de junior. Respeta los límites de RAM, la conexión entre contenedores y la importancia de la persistencia de datos.
2. **"Verify First" (Verificar Primero):** Nunca asumas el estado del servidor ni del código. Navegá la bóveda `Kairos_Brain/` y mandá `ls` a los proyectos antes de proponer cambios.
3. **Mandato de Lectura Inicial (OBLIGATORIO):** Al principio de cada sesión, la IA TENDRÍA que abrir y leer:
   - `Kairos_Brain/Bienvenido.md` (MOC raíz)
   - `Kairos_Brain/contexto-claude/Architecture_Index.md`
   - `Kairos_Brain/infra/System_Map.md`
   - `Kairos_Brain/contexto-claude/Rules_n8n.md`
   - `Kairos_Brain/contexto-claude/Engineering_Manifesto.md`
   - `Kairos_Brain/Roadmap.md`

## 🏗️ Flujo de Trabajo (Spec-Driven Development)
4. Nunca modifiques archivos que afecten a producción sin confirmación explícita.
5. El flujo de grandes cambios SIEMPRE es: **SPEC → PLAN → EJECUCIÓN → REVIEW → DOC**.
6. **Manejo de Secretos:** NUNCA harcodees contraseñas ni tokens en el código (ej. n8n). Usá `$env` en los workflows y `.env` en Docker. Siempre declaralos en un `.env.example`.
7. **Small Diffs (Cambios quirúrgicos):** Hacé cambios acotados y rápidos. Claude funciona mejor operando como cirujano, no amputando extremidades completas. Refactorizá usando sub-workflows si es muy complejo.

## 📝 Reglas de Documentación
8. **Nunca sobrescribas la documentación.** Siempre añadí (append) o editá quirúrgicamente la sección relevante de los readmes.
9. Ante cualquier cambio en un workflow, `.env`, contenedor, DB o prompt, actualizar **ANTES de cerrar la tarea**:
   - `README.md`
   - `Kairos_Brain/contexto-claude/Architecture_Index.md` o fichas de `proyectos/`
10. **Regla del Inbox (`inbox/`):** El directorio `Kairos_Brain/inbox/` es la zona de captura rápida para información sin clasificar. Si debes hacer un volcado de memoria implícita, extraer logs aislados, transcribir un postmortem rápido o dejar reflexiones que no encajan inmediatamente en la arquitectura o en un proyecto específico, escribilos SIEMPRE primero en el `inbox/`. El desarrollador se encargará de ubicarlos luego en el grafo de Obsidian.
11. **Génesis de Nuevos Proyectos:** Si el usuario solicita crear una app o sistema desde cero (ej: "quiero armar una app con IA"):
   - **Fase de Ideación (`inbox/`):** Empezá creando un documento borrador dentro de `Kairos_Brain/inbox/`. Deberás consultar automáticamente `Kairos_Brain/contexto-claude/Preferencias_Arquitectura.md` y las instrucciones generales para armar propuestas. Iterá en este archivo de inbox charlando con el usuario hasta tener un plan sólido.
   - **Pase a Producción (`proyectos/`):** RECIÉN cuando el plan y el stack estén 100% aprobados, instanciarás una ficha definitiva para ese proyecto dentro de `Kairos_Brain/proyectos/` extrayendo el contenido del inbox.
   - A medida que el código crezca y se depuren errores, **actualizarás de forma proactiva la documentación del proyecto dentro de la bóveda**. Obsidian debe evolucionar a la par del código.

## 🧠 Solución Integral
12. **Sin parches:** Buscá la raíz del problema ("root cause"). Si una base de datos se cuelga y provoca que n8n falle por timeout, la solución no es incrementar el timeout en n8n, sino arreglar el pooling en Pgbouncer o meter índices en Postgres.
13. En n8n, agregá sistemáticamente nodos *Wait* o *Retry* al conectarte a APIs externas conflictivas (OpenAI, Google Sheets) para evitar la rotura del flujo.
  - Si no encuentras una definición clara en los archivos cargados, PREGUNTA antes de inventar código o documentación.
