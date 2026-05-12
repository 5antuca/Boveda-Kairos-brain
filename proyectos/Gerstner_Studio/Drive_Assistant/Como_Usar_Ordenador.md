---
tags: [gerstner-studio, drive-assistant, ordenador, quickstart]
fecha: 2026-05-10
estado: ACTIVO
relacionado: [[Bot_Ordenador]] (detalle técnico)
---

# Cómo usar el Bot Ordenador — Guía rápida

Bot que reorganiza el Drive del sandbox (`1Kp4wPnKhZ...`). Trabaja en **2 pasos**:
1. Genera un **plan dry-run** (no toca nada, solo propone cambios).
2. Vos lo ejecutás cuando aprobás. Cada ejecución crea un `batch_id` para deshacer.

---

## Setup (una sola vez por sesión)

```bash
ADMIN=$(grep ADMIN_TOKEN /root/apps/ai-gerstner/.env | cut -d= -f2)
SCOPE=1NgCUk9MuOCo8Yla_Iq-pncPQo-36YQSc   # carpeta FOTOS FALTA ORDENAR
API=https://ai.kairosaisolutions.com/api
```

---

## Comandos básicos

### 1. Ver duplicados (sin tocar nada)

```bash
curl -H "Authorization: Bearer $ADMIN" \
  "$API/admin/orden/duplicates?scope_folder_id=$SCOPE" | jq '.empty_files_count, .duplicate_groups, .total_duplicates'
```

### 2. Generar plan de reorganización

```bash
# El primer parámetro es el scope. max_llm_calls afina la cobertura (más alto = mejor + caro).
curl -X POST -H "Authorization: Bearer $ADMIN" \
  "$API/admin/orden/plan?scope_folder_id=$SCOPE&max_llm_calls=500&background=true"
# → devuelve "started_in_background"

# Esperar ~5 min, después chequear:
curl -H "Authorization: Bearer $ADMIN" "$API/admin/orden/plans?limit=1" | jq '.plans[0] | {plan_id, stats}'
```

### 3. Ver plan completo (1910 cambios)

```bash
PLAN_ID=...   # del paso anterior
curl -H "Authorization: Bearer $ADMIN" "$API/admin/orden/plan/$PLAN_ID" | jq '.stats'

# Detalle de cambios específicos:
curl -H "Authorization: Bearer $ADMIN" "$API/admin/orden/plan/$PLAN_ID" \
  | jq '.changes[0:10]'   # primeros 10
```

### 4. Ejecutar — siempre con `confirm=true`

```bash
# 4a. Test run de 50 (recomendado primera vez):
curl -X POST -H "Authorization: Bearer $ADMIN" \
  "$API/admin/orden/execute?plan_id=$PLAN_ID&confirm=true&test_run=50"
# → devuelve batch_id

# 4b. Solo un proyecto (ir gradual):
curl -X POST -H "Authorization: Bearer $ADMIN" \
  "$API/admin/orden/execute?plan_id=$PLAN_ID&confirm=true&project=Ford+Mustang+Fastback"

# 4c. Ejecutar TODO lo restante:
curl -X POST -H "Authorization: Bearer $ADMIN" \
  "$API/admin/orden/execute?plan_id=$PLAN_ID&confirm=true"
```

El plan **es idempotente**: re-llamar execute no re-ejecuta cambios ya hechos. Sigue por los pendientes.

### 5. Si algo salió mal — UNDO

```bash
BATCH=...   # del response del execute
curl -X POST -H "Authorization: Bearer $ADMIN" \
  "$API/admin/orden/undo?batch_id=$BATCH&confirm=true"
```

Revierte TODOS los cambios de ese batch en orden inverso (rename → move → folder). Funciona hasta horas/días después; el audit log queda persistido sin TTL.

### 6. Ver historial de cambios

```bash
# Últimos 50 cambios
curl -H "Authorization: Bearer $ADMIN" "$API/admin/orden/audit?limit=50" | jq '.changes'

# Solo de un batch
curl -H "Authorization: Bearer $ADMIN" "$API/admin/orden/audit?batch_id=$BATCH" | jq '.changes'

# Resumen agregado de un batch
curl -H "Authorization: Bearer $ADMIN" "$API/admin/orden/audit/batch/$BATCH"
```

---

## Flujo recomendado (primera vez)

```
1. Generar plan        →  POST /admin/orden/plan
2. Revisar stats       →  GET  /admin/orden/plan/{plan_id}
3. Test_run 50         →  POST /admin/orden/execute?confirm=true&test_run=50
4. Validar en Drive    →  abrir https://drive.google.com/drive/folders/1Kp4wPnKhZ...
5a. Si OK →
     Ejecutar el resto →  POST /admin/orden/execute?confirm=true (sin test_run)
5b. Si NO OK →
     Undo del batch    →  POST /admin/orden/undo?batch_id=X&confirm=true
```

---

## Garantías de seguridad

- **Solo en sandbox**: el bot opera sobre `1Kp4wPnKhZ...` (tu copia), nunca sobre el original del taller.
- **Trash, no permanent**: los `delete` van a Papelera de Drive (recuperables ~30 días desde Drive web).
- **Audit log persistente**: cada cambio queda en MongoDB con `batch_id` para undo grupal.
- **Dry-run primero**: el plan no toca nada hasta que mandás `execute&confirm=true`.
- **Idempotencia**: re-ejecutar el plan saltea cambios ya hechos.
- **`_PARA_REVISAR/`**: archivos con baja confianza del clasificador NO se mueven al proyecto incorrecto — quedan en `_PARA_REVISAR/` para que los acomodes a mano.

---

## Lo que NO hace todavía

- **Upload directo desde frontend** (Fase 8-9): subir foto + decir "porsche singer techo" en el browser. Pendiente.
- **Detección de duplicados perceptuales**: solo md5 exactos, no foto resizeada.
- **Clasificación visual de videos**: van por carpeta de origen.

Detalle técnico completo en [[Bot_Ordenador]].
