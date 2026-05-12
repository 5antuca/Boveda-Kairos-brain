---
tags: [gerstner-studio, drive-assistant, ordenador, drive-write, deployed]
fecha-creacion: 2026-05-10
estado: ACTIVO — fases 1-7 deployadas el 2026-05-10
relacionado: [[Drive_Assistant]], [[Vision_Analyzer]]
---

# Bot Ordenador — implementación

Este doc cubre lo que está **deployado** y cómo usarlo.

## Fases implementadas

| # | Módulo | Archivo |
|---|---|---|
| 1 | OAuth full scope `drive` | `drive_service.py` SCOPES |
| 2 | Audit log infra | `services/audit_log.py` + collections `drive_changes_log`, `ordenador_plans` |
| 3 | Drive writer (rename/move/create/delete) | `services/drive_writer.py` |
| 4 | Detector duplicados md5 | `services/dedupe.py` |
| 5 | Classifier (path heurístico + vision + LLM) | `services/classifier_service.py` |
| 6 | Generador plan dry-run | `services/backfill_service.py` |
| 7 | Ejecutor + undo | `services/executor_service.py` |

Todavía pendiente: Fase 8 (upload backend) y Fase 9 (UploadPanel frontend).

---

## Endpoints API

Todos requieren `Authorization: Bearer $ADMIN_TOKEN` (mismo que el resto).

### Read-only (sin riesgo)

```bash
# Detectar duplicados (no borra, solo reporta)
GET /api/admin/orden/duplicates?scope_folder_id=X

# Listar planes pendientes/ejecutados
GET /api/admin/orden/plans?limit=5

# Ver plan completo (con todos los changes)
GET /api/admin/orden/plan/{plan_id}

# Audit log
GET /api/admin/orden/audit?limit=50&batch_id=X&operation=move&only_active=true
GET /api/admin/orden/audit/batch/{batch_id}
```

### Generación de plan (no escribe a Drive)

```bash
# Genera plan dry-run sobre todo lo bajo scope_folder_id
# max_llm_calls limita el costo (~$0.001 por call). Default 30, recomendado 200-500.
# background=true devuelve inmediato y procesa en background.
POST /api/admin/orden/plan?scope_folder_id=X&max_llm_calls=500&background=true
```

### Ejecución (modifica Drive — requiere confirm=true)

```bash
# Test run: ejecuta solo los primeros 50 cambios
POST /api/admin/orden/execute?plan_id=X&confirm=true&test_run=50

# Solo un proyecto (para ir gradual)
POST /api/admin/orden/execute?plan_id=X&confirm=true&project=Porsche+Singer

# Ejecución completa
POST /api/admin/orden/execute?plan_id=X&confirm=true

# Undo de un batch (revierte todos los cambios del run)
POST /api/admin/orden/undo?batch_id=Y&confirm=true
```

---

## Flujo recomendado de uso

### 1. Generar plan

```bash
ADMIN=$(grep ADMIN_TOKEN /root/apps/ai-gerstner/.env | cut -d= -f2)
SCOPE=1NgCUk9MuOCo8Yla_Iq-pncPQo-36YQSc  # FOTOS FALTA ORDENAR (carpetas viejas) en sandbox

curl -X POST -H "Authorization: Bearer $ADMIN" \
  "https://ai.kairosaisolutions.com/api/admin/orden/plan?scope_folder_id=$SCOPE&max_llm_calls=500&background=true"

# Esperar ~5 min, después:
curl -H "Authorization: Bearer $ADMIN" "https://ai.kairosaisolutions.com/api/admin/orden/plans?limit=1"
```

### 2. Revisar el plan

```bash
PLAN_ID=...  # del paso anterior
curl -H "Authorization: Bearer $ADMIN" \
  "https://ai.kairosaisolutions.com/api/admin/orden/plan/$PLAN_ID" | jq '.stats, .sample_changes'
```

### 3. Test run de 50 archivos

```bash
curl -X POST -H "Authorization: Bearer $ADMIN" \
  "https://ai.kairosaisolutions.com/api/admin/orden/execute?plan_id=$PLAN_ID&confirm=true&test_run=50"
# → devuelve batch_id
```

### 4. Validar en Drive web que los 50 quedaron bien

Abrir https://drive.google.com/drive/folders/1Kp4wPnKhZ-p3yj1dAdIbCJNw6i0KW5Qx
y verificar que los archivos llegaron a las carpetas correctas con los
nombres descriptivos.

### 5a. Si está OK → ejecutar el resto

```bash
curl -X POST -H "Authorization: Bearer $ADMIN" \
  "https://ai.kairosaisolutions.com/api/admin/orden/execute?plan_id=$PLAN_ID&confirm=true"
```

### 5b. Si NO está OK → undo del batch

```bash
BATCH=...  # del response del test_run
curl -X POST -H "Authorization: Bearer $ADMIN" \
  "https://ai.kairosaisolutions.com/api/admin/orden/undo?batch_id=$BATCH&confirm=true"
```

### 6. Carpetas tras la ejecución

Cada proyecto tendrá la estructura nueva:
```
Porsche Singer/
  Exterior/        (con subcarpetas Techo, Llantas, etc según se detecten)
  Interior/        (con Tablero, Asientos, Volante, etc)
  Motor/
  Procesos/
  Marketing/
  Videos/
_PARA_REVISAR/     (creada en el scope original — los archivos low-confidence)
```

---

## Decisiones operativas tomadas (deployadas)

| # | Decisión | Notas |
|---|---|---|
| **D1** | Naming archivos: `{slug-proyecto}_{slug-categoria}_{n:03d}.{ext}` | ej `porsche-singer_interior_023.jpg`. Si hay sub: `_interior-tablero_023.jpg`. |
| **D2** | Borrar usa `trashed=true` (no permanent delete) | Reversible desde Drive web por ~30 días si el undo del bot falla. |
| **D3** | `create_folder` es idempotente | Si la carpeta ya existe, devuelve la existente. |
| **D4** | Concurrencia secuencial en dedupe y drive_writer | El CDN de Drive corta SSL bajo paralelismo. Tarda más pero estable. |
| **D5** | `_PARA_REVISAR/` se crea en el scope original | Sirve como holding para archivos que el clasificador no pudo asignar. El usuario los reorganiza a mano después. |
| **D6** | Empty files (size=0) se borran como categoría aparte | Razón: `Archivo de 0 bytes — upload roto`. NO se cuentan como "duplicados". |

---

## Schemas

Resumen:

**`drive_changes_log`**: cada operación de escritura registra una entrada
con `change_id`, `batch_id`, `operation`, `file_id`, `before`, `after`,
`reason`, `classifier_meta`, `performed_at`, `reversed_at`.

**`ordenador_plans`**: cada plan dry-run guarda `plan_id`, `status`
(pending/executing/executed/executed_partial/rejected), `changes` (lista
completa), `stats` (agregados por proyecto, categoría, etc), `folders_to_create`.

---

## Limitaciones conocidas v1

- **Solo duplicados exactos (md5)**: no detecta perceptuales (foto resizeada).
  Si una foto está en 2 lugares con distinto md5 (ej. una a 1080p y otra a 720p),
  ambas se procesan como originales. v2.
- **Videos no se clasifican por contenido**: van a `{Proyecto}/Videos/` por
  carpeta de origen. Si el modelo no detecta el proyecto, van a `_PARA_REVISAR/`.
- **Subcategorías limitadas a las pre-definidas**: Tablero, Asientos, Volante,
  Palanca, Llantas, etc. Si una foto es de "Espejo retrovisor" no hay subcat
  específica — va a `Interior/` o `Exterior/` directo.
- **`max_llm_calls` es un cap duro**: si lo agotás, los archivos restantes que
  necesitarían LLM caen al fallback heurístico. Subir el cap = más cobertura
  pero más costo.
- **Durante warmup_cache (~3 min al startup), NO correr operaciones masivas**.
  El CDN de Drive se satura y empieza a tirar SSL errors. Esperar a que
  termine antes de generar planes o ejecutar.

---

## Pendientes (Fases 8-9)

- **Fase 8 — Upload backend**: endpoints `POST /upload/preview` (resuelve carpeta
  destino desde descripción) y `POST /upload/execute` (sube archivos al destino).
- **Fase 9 — UploadPanel frontend**: drag & drop + textarea de descripción +
  preview + confirmación.

Cuando se implementen, el flujo upload va a ser: usuario arrastra fotos +
escribe "porsche singer techo" → preview muestra `Porsche Singer/Exterior/Techo/`
→ confirma → uploads van a esa carpeta con nombres `porsche-singer_techo_NNN.jpg`.

---

## Estado

- **2026-05-10**: Fases 1-7 deployadas y testeadas. OAuth full verificado con
  smoke test (create+delete carpeta dummy). Detector duplicados funciona
  (28s sobre 2179 archivos, 254 dups + 15 vacíos detectados). Plan dry-run
  generado con éxito (Porsche Singer = 1047, Ferrari Dino = 71, etc).
  **Pendiente**: aprobar y ejecutar el primer test_run de 50 archivos.
