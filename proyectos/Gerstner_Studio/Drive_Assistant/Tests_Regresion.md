---
tags: [gerstner-studio, drive-assistant, testing, qa]
fecha-creacion: 2026-05-12
estado: ACTIVO — registro de bugs reportados y queries de regresión
relacionado: [[Funcionamiento]], [[Drive_Assistant]]
---

# Tests de regresión — Drive Assistant

Catálogo de queries que **alguna vez devolvieron resultado incorrecto** y se
convirtieron en test cases. Cada vez que el usuario reporta un nuevo error,
se suma acá + al script `backend/scripts/regression_test.sh`.

## Cómo correr

```bash
# Toda la suite
bash /root/apps/ai-gerstner/backend/scripts/regression_test.sh

# Filtrar por substring de la query
bash /root/apps/ai-gerstner/backend/scripts/regression_test.sh "etype"
```

El script hace POST `/api/chat/`, resuelve el `parent_folder_id` de la primer
imagen, y matchea contra el `expected_folder_substring` esperado. Pasa = ✅,
falla = ❌. Exit code 0 si todo pasa.

## Cómo sumar un caso nuevo cuando aparece un bug

1. Reproducir el error reportado contra prod.
2. Agregar línea al array `TESTS` de `regression_test.sh`:
   ```
   "tu query|expected_folder_substring|nota corta del bug"
   ```
3. Documentar acá: la query, qué devolvía mal, qué tiene que devolver, fecha,
   root cause si lo identificaste.

---

## Suite actual

### Variants y duplicados (bug 2026-05-12)

**Bug original**: queries con variant ("jaguar etype cabriolet capot") devolvían
una variant distinta ("Jaguar E-Type 60s"). Causa: `parse_intent` ponía "cabriolet"
en `keywords` (no en `project`) y el visual_boost de "capot" tipeaba la balanza
a 60s porque tenía "capot" en `vision_summary.parts`.

**Fix aplicado**: tres cambios combinados en `match_folders.py` + un cambio
de prompt en `parse_intent`:
1. Prompt: variants (cabriolet/roadster/v12/289/turbo...) van en `project`, no en `keywords`.
2. Hard filter en `_prefilter` por tokens "path-worthy" (project_tokens + keywords que aparecen en path de alguna carpeta que matchea project).
3. Visual boost SUMA al path score (no reemplaza ranking de candidatos).
4. Normalize "e type" → "etype" (igual al colapso "db 3" → "db3" existente).

**Principio canónico del usuario** (origen del fix): *"en autos repetidos
siempre se especifica el tipo de auto o color para saber dónde tiene que
buscar la IA"*.

| Query | Folder esperado | Cubre |
|---|---|---|
| `jaguar etype cabriolet capot` | Jaguar E-Type Cabriolet | El bug original — variant + visual_filter |
| `jaguar etype 60s` | Jaguar E-Type 60s | Variant numérica/año |
| `jaguar etype v12 motor` | Jaguar E-Type V12 | Variant alfanum + media_type |
| `jaguar etype roadster` | Jaguar E-Type Roadster | Variant simple |
| `shelby cobra 289` | Shelby Cobra 289 | Variant numérica + duplicados |
| `shelby cobra 427` | Shelby Cobra 427 | Variant numérica + duplicados |
| `porsche 911 turbo` | Porsche * Turbo | Variant simple |
| `porsche 911 targa` | Porsche 911 Targa | Variant simple |
| `toyota hilux rally` | Toyota Hilux Rally | Variant simple |

### Base project sin variant

| Query | Folder esperado | Notas |
|---|---|---|
| `jaguar etype` | Jaguar E-Type * | Cualquier variant aceptable cuando no se especifica |
| `interior del singer` | * Singer * | Post cleanup huérfanos 2026-05-12 |
| `aston martin db3` | Aston Martin DB3 | Sigla collapse `db 3 → db3` |

### Smoke baseline (proyectos comunes)

| Query | Folder esperado |
|---|---|
| `tablero shelby cobra` | Shelby * |
| `motor ferrari` | Ferrari * |
| `fotos del bronco` | Bronco |

---

## Casos NO cubiertos por la suite (gaps conocidos)

Estos siguen rotos pero no son blockers — quedan documentados para sumar
cuando se implemente la solución correspondiente:

| Query | Por qué falla | Solución cuando se implemente |
|---|---|---|
| `asientos cuero` | Sin proyecto → matcher se va a top-30 carpetas cortas y no boost por path | Opción A: per-file vision (filtrar `image_vision_cache` por tags directamente) |
| `jaguar amarillo` (si no hay un Jaguar amarillo) | Devuelve cualquier Jaguar — no valida color a nivel imagen | Opción A: per-file vision con filtro por `color_dominante` |
| `auto rojo descapotable 60s` | No hay búsqueda semántica vectorial | Opción B: text-embedding-3-small + Atlas Vector Search |
| `fotos del Singer ordenado` (post Bot Ordenador) | Carpeta `FOTOS FALTA ORDENAR` todavía existe | Ejecutar Bot Ordenador → vacía esa carpeta |

---

## Histórico de cambios

| Fecha | Cambio | Tests sumados |
|---|---|---|
| 2026-05-12 | Suite inicial, fix variants + visual boost combinado | 15 casos (9 variants + 3 base + 3 smoke) |

---

## Referencias

- Script: `/root/apps/ai-gerstner/backend/scripts/regression_test.sh`
- Código del matcher: `/root/apps/ai-gerstner/backend/app/agent/nodes/match_folders.py`
- Prompts: `/root/apps/ai-gerstner/backend/app/agent/prompts.py`
- Arquitectura: [[Funcionamiento]]
