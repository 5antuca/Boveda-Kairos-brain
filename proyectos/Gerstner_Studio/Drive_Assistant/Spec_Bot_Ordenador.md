---
tags: [gerstner-studio, drive-assistant, ordenador, spec, drive-write]
fecha-creacion: 2026-05-10
estado: SPEC EN REVIEW — pendiente aprobación del usuario antes de implementar
relacionado: [[Drive_Assistant]], [[Vision_Analyzer]], [[Spec_Vision_Analyzer]]
---

# Spec — Bot Ordenador de Drive

Agente que **escribe en Drive** para mantener el archivo del taller organizado.
Tiene dos modos de operación que comparten la misma infraestructura.

## Modo A — Backfill (one-shot)

Ordena lo que ya está desordenado. Concretamente, vacía
`FOTOS FALTA ORDENAR (carpetas viejas)/` (~250 carpetas en el original) y mueve
cada archivo al proyecto + categoría correcta.

## Modo B — Upload (continuo)

Endpoint + UI para que el usuario suba fotos/videos nuevos diciendo en
lenguaje natural a dónde van. Ejemplo: "porsche singer techo" + 5 fotos →
el bot resuelve la carpeta destino (`Porsche Singer/Exterior/Techo/`,
creándola si no existe) y sube los archivos ahí, renombrados
descriptivamente.

---

## Objetivos y no-objetivos

**Objetivos:**
- Vaciar `FOTOS FALTA ORDENAR/` reorganizando todo a proyectos + categorías.
- Permitir carga de archivos nuevos con clasificación automática vía descripción.
- Detectar y borrar duplicados exactos (mismo md5).
- Renombrar archivos a nombres descriptivos.
- Reversibilidad: cada cambio queda en audit log; undo posible.

**No-objetivos (v1):**
- Detectar duplicados perceptuales (foto resizeada con distinto md5). Queda para v2.
- Clasificar contenido visual de videos. Los movemos por carpeta de origen
  (modo backfill) o por descripción del usuario (modo upload).
- Auto-trigger sin aprobación humana. Backfill siempre dry-run + approve.

---

## Decisiones ya cerradas (2026-05-10)

| # | Decisión |
|---|---|
| **O1** | Operaciones: renombrar + mover + crear carpetas + borrar duplicados (todo). |
| **O2** | Modo de aprobación: dry-run en bulk → usuario aprueba todo o nada. Sin aprobación foto-por-foto. |
| **O3** | Estructura objetivo: por proyecto + categoría (`Porsche Singer/Interior/`, `/Exterior/`, `/Motor/`, `/Procesos/`, `/Marketing/`, `/Videos/`). |
| **O4** | Safety: audit log + endpoint `/undo-last-N`. Cada cambio reversible. |
| **O5** | Duplicados v1: solo exactos vía `md5Checksum` de Drive (gratis, confiable). Perceptuales v2. |
| **O6** | Videos: en backfill van a `{Proyecto}/Videos/` por carpeta origen. En upload van por descripción del usuario. Sin clasificación visual de contenido. |
| **O7** | OAuth scope: ampliado de `drive.readonly` a `drive` el 2026-05-10 (verificado con smoke test). |

---

## Categorías estándar por proyecto

```
{Proyecto}/
  Exterior/        carrocería, ángulos, vista lateral, frente, atrás
    Techo/         categoría suelta usable como subcarpeta libre
    Llantas/
    ...
  Interior/        cabina, asientos, tablero, palanca
    Tablero/       (alias: Dashboard)
    Asientos/
    ...
  Motor/           compartimento de motor
  Procesos/        fotos de trabajo (chapista, pintura, mecánica)
  Marketing/       fotos de presentación (sesión profesional, postventa)
  Videos/          todos los videos del proyecto
  _PARA_REVISAR/   fallback cuando el clasificador no está seguro
```

Las subcarpetas dentro de Exterior/Interior se crean **bajo demanda** cuando
el clasificador detecta una parte específica (Techo, Llantas, Asientos…).
No se generan vacías.

---

## Arquitectura — módulos compartidos

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend: chat actual (read-only)                          │
│  Frontend: UploadPanel (NUEVO, modo B)                      │
└──────────┬──────────────────────────────┬───────────────────┘
           │                              │
   POST /chat/                  POST /upload/preview
                                POST /upload/execute
           │                              │
           ▼                              ▼
┌────────────────────────────────────────────────────────────┐
│  Servicios compartidos                                      │
│  - classifier_service.py    (LLM + vision → proyecto/categ) │
│  - drive_writer.py          (rename/move/create/delete)     │
│  - audit_log.py             (registrar cambios + undo)      │
│  - dedupe.py                (md5 exact)                     │
└────────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
┌──────────────────────┐    ┌──────────────────────┐
│  Modo A: Backfill    │    │  Modo B: Upload      │
│  POST /admin/orden/  │    │  POST /upload/       │
│    plan              │    │    preview           │
│    execute           │    │    execute           │
│    undo              │    │                      │
└──────────────────────┘    └──────────────────────┘
```

---

## Schemas

### `drive_changes_log` (Mongo, audit log)

```js
{
  _id: ObjectId,
  change_id: "uuid",            // para undo individual
  batch_id: "uuid",             // agrupa cambios de un mismo plan/upload
  operation: "rename" | "move" | "create_folder" | "delete" | "upload",
  file_id: "abc123",            // archivo afectado
  before: {
    name: "IMG_8472.jpg",
    parents: ["folder_id_origen"]
  },
  after: {
    name: "singer_tablero_001.jpg",
    parents: ["folder_id_destino"]
  },
  reason: "Clasificado como tablero de Porsche Singer (vision: parts=tablero, conf=0.92)",
  classifier_meta: {
    project: "porsche singer",
    category: "Interior",
    sub: "Tablero",
    visual_filter: null,
    source_path: "FOTOS FALTA ORDENAR (carpetas viejas)/00 Porsche Singer fotos/Marketing y Publicidad Singer/Tablero Dashboard"
  },
  performed_by: "user@example.com" | "backfill" | "upload",
  performed_at: ISODate,
  reversed_at: ISODate | null
}
```

### `ordenador_plans` (Mongo, dry-run plans)

```js
{
  _id: ObjectId,
  plan_id: "uuid",
  scope: "FOTOS FALTA ORDENAR (carpetas viejas)",
  status: "pending" | "approved" | "executing" | "executed" | "rejected",
  created_at: ISODate,
  approved_at: ISODate | null,
  executed_at: ISODate | null,
  changes: [
    {
      change_id: "uuid",
      operation: "...",
      file_id: "...",
      before: {...},
      after: {...},
      reason: "..."
    }
  ],
  stats: {
    total: 247,
    by_op: { rename: 247, move: 230, delete: 17 },
    by_project: { "porsche singer": 89, "shelby cobra 289": 34, ... }
  }
}
```

---

## Modo A — Backfill: flujo

```
1. POST /admin/orden/plan?scope=fotos_falta_ordenar
   → Bot escanea FOTOS FALTA ORDENAR/
   → Para cada archivo:
        a. Detecta md5 → si ya existe en otra carpeta: marcar como DELETE (duplicado)
        b. Si no es duplicado: clasifica
           - LLM lee el path original ("Marketing y Publicidad Singer/Butacas")
             para hint del proyecto (Singer)
           - Vision tags ya guardados (image_vision_cache) para hint de categoría (Interior, Asientos)
           - Si videos: clasifica solo proyecto, categoría = Videos/
           - Si confianza < 0.6: destino = _PARA_REVISAR/
        c. Genera nombre descriptivo: "{proyecto}_{categoria}_{n}.{ext}"
        d. Decide path destino: "{Proyecto}/{Categoria}/{Sub?}/{nombre}"
   → Guarda plan en `ordenador_plans` con status=pending
   → Devuelve plan_id + stats + URL de aprobación

2. UI muestra plan (o el usuario lo lee con curl)
   - Stats agregados (cuántos por proyecto, por categoría, cuántos duplicados, cuántos a revisar)
   - Sample de los primeros 20 cambios
   - Diff "antes → después" legible

3. POST /admin/orden/execute?plan_id=X (con confirmación explícita)
   → Marca status=executing
   → Por cada cambio: ejecuta en Drive + escribe entrada en drive_changes_log
   → Marca status=executed
   → Devuelve report final

4. POST /admin/orden/undo?batch_id=X (opcional, hasta horas/días después)
   → Lee drive_changes_log filtrado por batch_id
   → Revierte cada cambio en orden inverso
   → Marca reversed_at en cada entrada
```

---

## Modo B — Upload: flujo

```
1. Usuario en frontend abre tab "Subir"
2. Drag & drop de archivos + textarea "describí (ej: 'porsche singer techo')"
3. Frontend → POST /upload/preview { description, files: [{name, size, mime}] }
   Backend:
     - parse_intent(description) → project + visual_filter + media_type
     - resolve_destination_folder(intent) → folder_id (creando subcategoría si hace falta)
     - sugerir nombres descriptivos por archivo
   → Devuelve { destination_path, destination_folder_id, names_proposed }
4. Frontend muestra confirmación:
     "Subir 5 archivos a 'Porsche Singer/Exterior/Techo/' como
      singer_techo_001.jpg, singer_techo_002.jpg, …"
   [SÍ] [Cancelar]
5. Frontend → POST /upload/execute (multipart con archivos + folder_id + names)
   Backend:
     - drive.files.create() por cada archivo en folder_id destino
     - Registra entradas en drive_changes_log con operation="upload"
   → Devuelve file_ids creados + nuevo path
6. UI muestra confirmación + link a la carpeta en Drive
```

---

## Endpoints API (nuevos)

Todos requieren `Authorization: Bearer $ADMIN_TOKEN` (igual que los actuales).

```
# Modo A (backfill)
POST /admin/orden/plan?scope=fotos_falta_ordenar  → genera plan dry-run
GET  /admin/orden/plan/{plan_id}                  → ver plan generado
POST /admin/orden/execute?plan_id=X               → ejecutar plan aprobado
POST /admin/orden/undo?batch_id=X                 → revertir un batch
GET  /admin/orden/audit?limit=50&since=ISO        → ver historial

# Modo B (upload)
POST /upload/preview                              → calcular destino
POST /upload/execute (multipart)                  → subir archivos al destino
```

---

## Plan de fases

| Fase | Qué hace | Necesita OAuth full? | Riesgo |
|---|---|---|---|
| **0. Spec** (este doc) | Definir alcance, esquemas, flujos | No | — |
| **1. OAuth ampliado** | Scope `drive` | ✅ HECHO 2026-05-10 | — |
| **2. Audit log infra** | Mongo collections + helpers | No | Bajo |
| **3. Drive writer service** | rename/move/create/delete con audit | Sí | Medio |
| **4. Detector duplicados (md5)** | Lista duplicados encontrados | No | Bajo |
| **5. Classifier service** | LLM + vision → proyecto/categ destino | No | Bajo |
| **6. Backfill: generador plan** | Iterar `FOTOS FALTA ORDENAR/`, generar plan dry-run | No | Bajo |
| **7. Backfill: ejecutor + undo** | Endpoints execute/undo con audit | Sí | **Alto** |
| **8. Upload: backend** | `/upload/preview` + `/upload/execute` | Sí | Medio |
| **9. Upload: frontend UploadPanel** | UI para drag & drop + descripción | No | Bajo |

Fases 2-6 no escriben nada en Drive — se pueden iterar sin riesgo. Fase 7
es el momento crítico: la primera ejecución real va a mover ~250 archivos.

---

## Mitigaciones de riesgo

1. **Test runs primero**: antes de ejecutar el plan completo, correr sobre un
   subset (ej. solo carpeta `Bronco/`) y validar que el resultado tiene sentido.
2. **Undo siempre disponible**: cada batch_id puede revertirse hasta que se
   borre del audit log (sin TTL — los logs pesan poco).
3. **`_PARA_REVISAR/` como red de seguridad**: si el clasificador no está
   seguro (confidence < 0.6), el archivo va a esa carpeta en vez de a un
   proyecto incorrecto. Mejor que quede ahí a que termine en el lugar equivocado.
4. **No tocar el original del taller**: el bot solo opera sobre el sandbox
   `1Kp4wPnKhZ-p3yj1dAdIbCJNw6i0KW5Qx`. Si más adelante se quiere aplicar al
   Drive del taller, se hace una nueva spec con doble validación.
5. **Smoke tests antes de cada ejecución**: confirmar que el OAuth sigue
   funcionando con un create+delete en una carpeta dummy.

---

## Bloqueantes y dudas pendientes

- ¿Confirmación final por email/WhatsApp antes de ejecutar el plan? Útil si
  alguien más del equipo va a aprobar. v1: no, solo el frontend o curl.
- ¿Cómo manejar archivos compartidos entre proyectos (foto que aparece en
  Singer + Bronco)? v1: el clasificador elige uno; si hay duplicado md5 lo
  detecta y borra. Si tiene que aparecer en ambos, mover a uno y crear shortcut
  al otro (Drive lo soporta vía `files.create` con `mimeType: shortcut`). v2.
- ¿Naming convention exacta? Propongo `{slug_proyecto}_{slug_categoria}_{n:03d}.{ext}`,
  ej `porsche-singer_interior_023.jpg`. Vos decidís el formato exacto.

---

## Estado

- **2026-05-10**: spec escrita. OAuth ampliado y verificado. Pendiente
  aprobación del usuario y arranque de Fase 2.
