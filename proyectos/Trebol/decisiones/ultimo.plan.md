# PLAN: Fix formato JSON fotos en AI Agent trebol22-test

> **Fecha**: 2026-02-24
> **Estado**: ✅ Completado
> **Workflow afectado**: `trebol22_test` (ID: `vGGBdvFL-Q_mLHzDiGk2I`)

---

## Contexto

Durante una sesión de prueba, el bot mandó las fotos de un vehículo **y** una pregunta de seguimiento ("Perfecto, Santi. ¿Querés que te avise sobre financiación...?") en el **mismo mensaje de WhatsApp**, en vez de en dos mensajes separados.

---

## Root Cause Analysis

### Cadena de nodos involucrados

```
AI Agent → Basic LLM Chain → Parse Chain Output → Switch2 → HTTP Request (Chatwoot)
```

### Falla: AI Agent no siguió el formato JSON

El AI Agent (execution 2614, 17:10:18 UTC) outputeó texto plano con URLs inline:

```
Acá te paso las fotos de la Fiat Strada Adventure 1.6 Cabina extendida Mt 2015:

https://http2.mlstatic.com/.../D_NQ_NP_2X_754669-...-F.webp
https://http2.mlstatic.com/.../D_NQ_NP_2X_666754-...-F.webp
https://http2.mlstatic.com/.../D_NQ_NP_2X_850914-...-F.webp
https://http2.mlstatic.com/.../D_NQ_NP_2X_777950-...-F.webp

Perfecto, Santi. ¿Querés que te avise sobre financiación o querés pasar por la agencia?
```

El Basic LLM Chain recibió este bloque como texto plano (Rule 5 de su prompt: "Si el input es texto plano → todo va en mensaje1"). Puso todo en `mensaje1`, `cantidad_de_mensajes: 1` → un solo mensaje de Chatwoot.

**El Basic LLM Chain se comportó correctamente.** El bug era del AI Agent.

### Por qué el AI Agent ignoró el formato

El prompt tenía en la sección RESPUESTA: `RESPUESTA — solo JSON, nada fuera: {...}` pero:
- No había ejemplo concreto del patrón "fotos + mensaje de seguimiento"
- La sección FOTOS decía "URLs solo en arrays" sin REGLA DE ORO ni consecuencia explícita
- GPT-4.1-mini cayó en el comportamiento por defecto (texto markdown con URLs inline)

### Output CORRECTO esperado

```json
{
  "mensaje1": "Acá te paso las fotos de la Fiat Strada Adventure 1.6 2015:",
  "fotos_mensaje1": ["https://url1.webp","https://url2.webp","https://url3.webp","https://url4.webp"],
  "mensaje2": "Perfecto, Santi. ¿Querés que te avise sobre financiación o querés pasar por la agencia?",
  "fotos_mensaje2": [],
  "mensaje3": "",
  "fotos_mensaje3": []
}
```

---

## Cambios Aplicados

### 1. Sección FOTOS (system prompt AI Agent)

**Antes:**
```
- Con URLs → usar esas URLs exactas. Solo en arrays fotos_mensaje, nunca en texto.
...
Texto cuando hay fotos → solo intro ("Acá te paso las fotos:"). URLs solo en arrays.
```

**Después:**
```
- Con URLs → usar esas URLs exactas. SOLO en arrays fotos_mensaje. NUNCA poner URLs en el texto de mensaje1/mensaje2/mensaje3.
...
Texto cuando hay fotos → solo intro breve en mensaje1 ("Acá te paso las fotos:"). Si también tenés un texto de seguimiento, va en mensaje2 con fotos_mensaje2 vacío.

REGLA DE ORO: Una URL en el cuerpo de un mensaje (fuera de fotos_mensaje) es un error de formato. No existe ninguna situación válida en la que una URL de foto aparezca en mensaje1, mensaje2 o mensaje3.

EJEMPLO CORRECTO — fotos + mensaje de seguimiento:
{"mensaje1":"Acá te paso las fotos de la Fiat Strada Adventure 1.6 2015:","fotos_mensaje1":["https://url1.webp","https://url2.webp","https://url3.webp"],"mensaje2":"¿Querés que te avise sobre financiación o preferís pasar por la agencia?","fotos_mensaje2":[],"mensaje3":"","fotos_mensaje3":[]}
```

### 2. Sección RESPUESTA (system prompt AI Agent)

**Antes:**
```
RESPUESTA — solo JSON, nada fuera:
{...template vacío...}

URLs solo en arrays fotos_mensaje. Listas solo en mensaje1.
Fotos: solo cuando el cliente las pide explícitamente o es la primera vez que muestra ese vehículo.
Expresión de interés → INTERÉS CONFIRMADO (no enviar fotos).
```

**Después:** Agregado bloque `REGLA DE ORO` + distribución explícita de campos + patrón para el caso fotos + texto posterior.

---

## Deploy

| Paso | Estado |
|------|--------|
| Modificar `/tmp/trebol22_test_workflow_updated.json` via Python | ✅ |
| PUT a n8n test `http://172.23.0.6:5678/api/v1/workflows/vGGBdvFL-Q_mLHzDiGk2I` | ✅ |
| versionId después: `3d3c721f-c8b2-4575-b5f1-a29739640f0d` | ✅ |
| Export del workflow a `workflows/trebol22_test.json` | ✅ |
| Actualizar `.claude/context/architecture.md` | ✅ |
| Commit + push a GitHub (`5bccfe5`) | ✅ |

---

## Pendiente

- [ ] Validación manual: pedirle fotos al bot y verificar que lleguen como mensaje1 separado de la pregunta de seguimiento en mensaje2
- [ ] Deploy a prod (solo el system prompt del AI Agent en `trebol22_prod`)

---

## Rollback

Si el cambio rompe algo, restaurar el prompt a la versión anterior:
- versionId anterior: `c4203962-0ce2-4c58-9021-1d7900491d5d`
- Revertir los dos bloques modificados en `workflows/trebol22_test.json` y hacer PUT a la API
