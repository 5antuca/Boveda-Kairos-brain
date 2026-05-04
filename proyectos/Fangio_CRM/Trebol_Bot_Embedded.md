---
tags: [fangiocrm, trebol-bot, integracion, langgraph, multitenant, configuracion]
fecha: 2026-05-04
estado: DISEÑO — pendiente implementación
relacionado: [[Roadmap_Stock_Ingestion_v1]], [[FangioBot_v2_Architecture]], [[../LangGraph_Bot/LangGraph_Bot]]
---

# Trebol Bot Embebido en FangioCRM

Decisión del usuario (2026-05-04): el bot Trebol (LangGraph Python, hoy corriendo como `trebol-test-bot`) será **el motor unificado de respuestas WhatsApp para todos los tenants de FangioCRM**, reemplazando el pipeline n8n de FangioBot v2. Cada tenant tiene una sección de configuración propia en la UI.

---

## Por qué unificar

- Trebol Bot ya tiene **principios canónicos probados** ([[../Trebol/Pipeline_v4]] y `Bot_Principios_Canonicos.md`): cualificación funnel, mostrar lo pedido, preguntar adyacente, tono espejo, cierre+handoff.
- Tiene **observabilidad** vía Langfuse (traces por turno).
- Tiene **regresión automatizada** (`bash scripts/test_bot.sh all`).
- Mantener dos motores (n8n FangioBot v2 + Python Trebol Bot) duplica esfuerzo y los pone a divergir.
- Si todos los tenants usan el mismo motor, los principios canónicos se mejoran una sola vez para todos.

---

## Configuración personalizable por tenant

Cada tenant en FangioCRM tiene una sección **"Configuración del Asistente"** con estos campos:

### Campos editables

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `concesionaria_nombre` | string | (requerido) | "El Trébol Automotores" — usado en saludos |
| `concesionaria_locacion` | string | "" | "Pergamino, Buenos Aires" — opcional |
| `vendedor_nombre` | string | "Asistente" | Nombre del bot ("Soy Bruno, asistente del Trébol") |
| `vendedor_genero` | enum | "neutro" | masculino / femenino / neutro — para concordancia |
| `tono` | enum | "profesional_calido" | serio / profesional_calido / suelto / amigable |
| `metodos_financiacion` | text | "" | "Efectivo, transferencia, prendarios hasta 36 cuotas..." |
| `dolar_referencia` | enum | "blue" | blue / oficial / mep — qué cotización usar para conversiones |
| `horarios_atencion` | object | (default) | { lun_vie: "9-18", sab: "9-13", dom: null } |
| `derivacion_phrase` | string | (default canónica) | Frase de cierre VIP (override solo si justifica) |
| `handoff_grupo_id` | string | (requerido) | ID del grupo WhatsApp donde se notifica al equipo |
| `bot_off_default` | bool | false | Si por default el bot está apagado y solo responde si lo activan |

### Cómo se aplica

El system prompt se construye dinámicamente con templating. El template canónico vive en `bot-service/configs/prompts/base.txt` con placeholders:

```
Sos {vendedor_nombre}, asistente de pre-venta de {concesionaria_nombre}{concesionaria_locacion_suffix}.

Tu misión es entender qué necesita el cliente y conectarlo con un vendedor humano.

[ESTILO]
{tono_block}

[FINANCIACIÓN]
{metodos_financiacion}

[HORARIOS]
{horarios_block}

... etc
```

Los bloques `tono_block`, `horarios_block` etc se generan en código según los valores del tenant. Los **principios canónicos NO son editables** por el tenant — son comunes a todos.

### Where lives the config

```jsonc
// MongoDB: tenants collection (ya existe en FangioCRM)
{
  "_id": "el-trebol",
  "nombre": "El Trébol Automotores",
  // ... otros campos del tenant ...
  "bot_config": {
    "concesionaria_nombre": "El Trébol Automotores",
    "concesionaria_locacion": "Pergamino, Buenos Aires",
    "vendedor_nombre": "Bruno",
    "vendedor_genero": "masculino",
    "tono": "profesional_calido",
    "metodos_financiacion": "Efectivo, transferencia bancaria...",
    "dolar_referencia": "blue",
    "horarios_atencion": { "lun_vie": "9-18", "sab": "9-13", "dom": null },
    "handoff_grupo_id": "120363xxxx@g.us",
    "bot_off_default": false,
    "version": 4,
    "updated_at": "2026-05-04T..."
  }
}
```

El bot lo cachea en Redis con TTL 5 min para no golpear Mongo en cada turno. Cuando el usuario edita y guarda en la UI, el endpoint del CRM hace `INVALIDATE` del cache (`DEL tenant_config:{tenantId}`).

---

## Cambios necesarios en `bot-service/trebol_bot/`

### 1. Carga de config por tenant

Hoy el bot carga `configs/trebol.yaml` hardcoded. Necesita:

- `bot-service/trebol_bot/config/loader.py` (NUEVO)
  - Función `load_tenant_config(tenant_id) -> TenantConfig` con cache Redis.
  - Si MongoDB no responde → fallback a YAML local (graceful degradation).

### 2. System prompt dinámico

- `bot-service/trebol_bot/agent/prompts.py` ya parametriza `{ESTADO_CALIFICACION}` (Fase 7). Extender para:
  - `{CONCESIONARIA_NOMBRE}`, `{VENDEDOR_NOMBRE}`, `{METODOS_FINANCIACION}`, `{HORARIOS_BLOCK}`, etc.
  - Bloques condicionales por `tono`: leer plantilla `prompts/tono/{tono}.txt`.

### 3. Multi-tenant en tools

- `tools.py` → `buscar_inventario_autos(tenant_id, ...)` lee de `inventory_{tenant_id}` (ver [[Roadmap_Stock_Ingestion_v1]]).
- `derivar_a_vendedor(tenant_id, ...)` usa `handoff_grupo_id` del tenant.
- Toda tool debe **fallar ruidoso** si no recibe `tenant_id` — nunca asumir Trébol.

### 4. Resolución de tenant desde el webhook

`webhook/chatwoot.py` y `webhook/fangiocrm.py` (NUEVO) deben:
- Recibir el payload (Chatwoot o FangioCRM).
- Extraer `instance` (Evolution) o `inbox_id`.
- Resolver `tenant_id` vía un mapa `instance → tenant_id` (cargado al boot desde Mongo).
- Inyectar `tenant_id` en el `AgentState`.

### 5. Identity lock por tenant

El "IDENTITY LOCK" del system prompt debe leerse del config:
```
Sos {vendedor_nombre}, asistente de pre-venta de {concesionaria_nombre}.
NUNCA inventes precios, cuotas ni datos de inventario.
NUNCA hables de otra concesionaria que no sea {concesionaria_nombre}.
```

---

## Topología del bot embebido

```
┌──────────────────────────────────────┐
│  FangioCRM Frontend (Next.js)        │
│   ⚙️ Configuración del Asistente     │
│   (CRUD bot_config en tenant doc)    │
└────────────────┬─────────────────────┘
                 │
                 ▼ (POST /api/tenants/:id/bot-config)
┌──────────────────────────────────────┐
│  FangioCRM API → MongoDB tenant doc  │
│  Al guardar: invalida cache Redis    │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  Evolution API (multi-instance)      │
│   ─ instance: el-trebol              │
│   ─ instance: tenant-N               │
└────────────────┬─────────────────────┘
                 │ webhook
                 ▼
┌──────────────────────────────────────┐
│  trebol-bot (LangGraph Python)       │
│   ─ webhook resuelve tenant_id       │
│   ─ load_tenant_config(tenant_id)    │
│   ─ Agent con system prompt dinámico │
│   ─ Tools reciben tenant_id          │
│   ─ Queries a inventory_{tenant_id}  │
└──────────────────────────────────────┘
```

---

## Migración: FangioBot v2 (n8n) → Trebol Bot embedded

### Estado actual de FangioBot v2 ([[FangioBot_v2_Architecture]])
- Workflow n8n con Extractor + AI Agent + tools.
- Lead estructurado en Redis (`{chat_id}:lead`).
- Tenant context vía `GET /api/agent/context?instance=...`.

### Plan de migración (después de Sprint 4 del Roadmap_Stock_Ingestion_v1)

1. **Sprint X.1**: Trebol Bot soporta multi-tenant (cambios 1-5 de arriba).
2. **Sprint X.2**: Tomar 1 tenant de prueba (no Trébol — un tenant nuevo o demo) y pasarlo a Trebol Bot. n8n FangioBot v2 sigue activo para los demás.
3. **Sprint X.3**: Comparar respuestas durante 2 semanas. Ajustar templates de tono según feedback.
4. **Sprint X.4**: Cutover completo — todos los tenants pasan a Trebol Bot. n8n FangioBot v2 se archiva.

### Qué se pierde, qué se gana

| | FangioBot v2 (n8n) | Trebol Bot embedded |
|---|---|---|
| Latencia | ~3-5s (con n8n + LLM calls) | ~2-4s (Python directo) |
| Observabilidad | Ejecuciones n8n + Postgres | Langfuse traces estructurados |
| Personalización | Vía endpoint context (HTTP) | Vía Mongo + cache Redis |
| Tools | n8n nodes | Python decorators (más rápido iterar) |
| Multi-tenant | Sí (vía instance) | Sí (vía tenant_id) |
| Test harness | Manual | `bash scripts/test_bot.sh` |
| Operaciones soportadas | compra/permuta/venta/admin | Mismas + extensible |

---

## Estado

- **2026-05-04**: documento creado. Bloqueado por roadmap principal Sprints 0-4.

---

## Referencias

- [[Roadmap_Stock_Ingestion_v1]] — pipeline de inventario que el bot consume
- [[FangioBot_v2_Architecture]] — bot actual de FangioCRM (a reemplazar)
- [[../LangGraph_Bot/LangGraph_Bot]] — arquitectura del bot Python actual
- [[../Trebol/Pipeline_v4]] — pipeline de referencia
- `Kairos_Brain/proyectos/LangGraph_Bot/Bot_Principios_Canonicos.md` (si existe)
