---
tags: [fangiobot, arquitectura, v2, n8n, rediseño]
fecha: 2026-04-15
estado: DISEÑO APROBADO — pendiente implementación
---

# FangioBot v2 — Arquitectura Rediseñada

Rediseño completo surgido del testing en vivo de v1 (2026-04-15).  
v1 tenía bugs estructurales que hacían necesario replantear el pipeline de contexto.

---

## Por qué v2

Durante el primer test real con Evolution API conectada, v1 falló en tres puntos:

1. **Normalizar Payload**: leía `$input.first().json` en vez de `.json.body` → todo `undefined`
2. **4 branches paralelos → Code node**: n8n dispara el Code al primer branch que termina, los otros 3 "no ejecutados" → crash
3. **Estado disperso en 3 keys Redis** (`state`, `ficha_enviada`, `permuta_data`): difícil de mantener, sin visión unificada del cliente

Además, las guardias usaban regex sobre el texto del cliente — frágil y no escalable.

**Decisión**: rediseño completo. Sin guardias. Sin regex. Sin paralelos. Una sola key de estado.

---

## Misión del Bot

Recopilar datos del cliente de forma natural para **facilitar el trabajo del vendedor y filtrar curiosos**.  
Toda operación termina en derivación humana. El bot no cierra ventas — las prepara.

---

## Operaciones Soportadas

| Operación | Descripción | Datos a recopilar |
|---|---|---|
| `compra` | Cliente quiere comprar un auto | Auto buscado (o uso si no sabe), financia, presupuesto |
| `permuta` | Cliente compra + entrega su auto como parte de pago | Todo de compra + datos del auto que entrega |
| `venta` | Cliente quiere vender su auto a la concesionaria | Marca, modelo, año, km, estado general |
| `admin` | Papeles, trámites, consultas administrativas | — (derivar inmediato) |

Todas terminan en `derivar_a_vendedor`.

---

## Modelo de Datos: `{chat_id}:lead`

Una sola key Redis por conversación. TTL: 72h.

```json
{
  "nombre": null,
  "turno": 0,
  "operacion": null,
  "estado": "nuevo",

  "busca": {
    "autoDefinido": null,
    "auto": null,
    "uso": null
  },

  "vende": {
    "marca": null,
    "modelo": null,
    "anio": null,
    "km": null,
    "estado_gral": null
  },

  "financia": null,
  "presupuesto_usd": null
}
```

**Campos de `operacion`**: `"compra"` | `"permuta"` | `"venta"` | `"admin"` | `null`  
**Campos de `estado`**: `"nuevo"` | `"calificando"` | `"listo"` | `"derivado"`  
**Campos de `busca.uso`**: `"ciudad"` | `"ruta"` | `"campo"` | `"familia"` | `null`  
**Campos de `vende.estado_gral`**: `"impecable"` | `"bueno"` | `"regular"` | `"malo"` | `null`

Regla: **un campo con valor nunca se pisa con null**. El merge solo actualiza campos que hoy son null.

---

## Pipeline v2 — Diagrama

```
Webhook Evolution API
  └─► Respond 200 OK (paralelo, inmediato)
  └─► Normalizar Payload
        └─► IF Skip (fromMe | status | vacío)
              └─► Redis GET bot_off
                    └─► IF Bot Off
                          └─► Redis SET Debounce (LPUSH)
                                └─► Wait 3s
                                      └─► Redis GET Debounce (LRANGE)
                                            └─► ¿Soy el último? (Code)
                                                  └─► IF Soy Primero
                                                        └─► Redis SET Lock

══════════════════════════════════════════
 CARGA DE CONTEXTO (secuencial, sin paralelos)
══════════════════════════════════════════
                                                              └─► Redis GET Lead
                                                                    └─► GET Tenant Context (HTTP)

══════════════════════════════════════════
 LLM 1 — EXTRACTOR NANO
══════════════════════════════════════════
                                                                          └─► Extractor LLM Nano
                                                                                └─► Merge Lead (Code)

══════════════════════════════════════════
 CONSTRUIR CONTEXTO + AI AGENT
══════════════════════════════════════════
                                                                                      └─► Construir Prompt Block (Code)
                                                                                            └─► AI Agent

══════════════════════════════════════════
 POST-PROCESSING
══════════════════════════════════════════
                                                                                                  └─► Guardar Contexto (Code)
                                                                                                        └─► IF Bot Off?
                                                                                                              └─► Redis SET Bot Off
                                                                                                        └─► POST Lead → FangioBot
                                                                                                        └─► Enviar Mensaje (Evolution)
                                                                                                              └─► Redis DEL Lock
```

**Total nodos: ~24** (vs 45 en v1)  
**LLM calls por turno: 2** (igual que v1, diferente rol)  
**Redis keys por chat: 2** (`lead`, `bot_off`) vs 4 en v1

---

## LLM 1 — Extractor Nano

**Modelo**: `gpt-4.1-nano` (o `gpt-4o-mini`)  
**Propósito**: Leer el mensaje del cliente EN CONTEXTO del lead actual y extraer campos estructurados. Sin regex.

### Input al LLM

```
Sos un extractor de datos de conversación de ventas de autos.
Tenés el estado actual del lead y el nuevo mensaje del cliente.
Devolvé SOLO JSON válido con los campos que pudiste inferir del mensaje.
Si un campo no se puede inferir, devolvé null.
No inventes datos. No respondas al cliente.

ESTADO ACTUAL DEL LEAD:
{lead_actual_json}

MENSAJE DEL CLIENTE:
"{textoCompleto}"
```

### Output esperado

```json
{
  "nombre": "Jonathan",
  "operacion": "permuta",
  "busca_auto": "Corolla",
  "busca_autoDefinido": true,
  "busca_uso": null,
  "vende_marca": "Renault",
  "vende_modelo": "Duster",
  "vende_anio": 2018,
  "vende_km": 85000,
  "vende_estado_gral": null,
  "financia": true,
  "presupuesto_usd": null
}
```

### Merge Lead (Code node)

Aplica el output del Extractor al lead actual. Regla: **solo actualiza campos que eran null**.

```js
// Solo actualizar campos que hoy son null en el lead
const lead = redisLead || defaultLead;
const updates = extractorOutput;
const merged = { ...lead };
if (!lead.nombre && updates.nombre) merged.nombre = updates.nombre;
if (!lead.operacion && updates.operacion) merged.operacion = updates.operacion;
// ... etc para cada campo
merged.turno = (lead.turno || 0) + 1;
return merged;
```

---

## Construir Prompt Block

Code node determinístico. Lee el lead mergeado y genera:
1. El **bloque de contexto** para el system prompt
2. El **proximo_objetivo** — dinámico, basado en qué campos son null

### Lógica de proximo_objetivo

```
Si operacion = null            → "Detectar qué quiere hacer (comprar, permutar, vender, admin)"
Si nombre = null               → "Obtener el nombre naturalmente"
Si operacion = "admin"         → "Derivar a administración de inmediato"
Si operacion = "compra":
  Si busca.auto = null y uso = null → "Preguntar para qué quiere el auto (uso)"
  Si busca.auto = null y uso != null → "Recomendar opciones según uso"
  Si busca.auto != null y presupuesto = null → "Preguntar presupuesto"
  Si presupuesto != null         → "Mostrar opciones y derivar"
Si operacion = "permuta":
  [primero completar datos de compra, luego datos de vende]
  Si vende incompleto            → "Recopilar: {campos faltantes del auto a entregar}"
  Si todo completo               → "Derivar a vendedor con resumen"
Si operacion = "venta":
  Si vende incompleto            → "Recopilar: {campos faltantes del auto a vender}"
  Si todo completo               → "Derivar a vendedor con resumen"
```

### Bloque en system prompt

```
# CLIENTE
Nombre: Jonathan | Operación: Permuta | Turno: 4 | Financia: Sí

# LO QUE BUSCA COMPRAR
Auto: Corolla ✅ | Uso: sin definir

# AUTO QUE ENTREGA
Renault Duster ✅ | Año: 2018 ✅ | Km: 85.000 ✅ | Estado: sin dato ❌

# PRESUPUESTO
Sin declarar ❌

# PRÓXIMO OBJETIVO
Falta el estado general del Duster. Preguntalo de forma natural,
sin hacer un formulario. Ejemplo: "¿Cómo está el Duster en general?"
```

---

## AI Agent

**Modelo**: `gpt-4.1-mini`  
**Memory**: Simple Memory (window=3) — en RAM, compensado con el lead en Redis  
**Tools**:

| Tool | Tipo | Cuándo usar |
|---|---|---|
| `buscar_vehiculos` | Code Tool | Antes de mencionar cualquier auto |
| `opciones_financiacion` | Code Tool | Cuando el cliente pregunta por cuotas/financiación |
| `calcular_cuotas` | Workflow Tool | Cuando tiene: auto + anticipo declarado |
| `derivar_a_vendedor` | Code Tool | Cuando el lead está "listo" o el cliente lo pide |

**`derivar_a_vendedor`** recibe el lead completo y:
1. Formatea un resumen para el grupo de vendedores
2. POST al grupo via Evolution API
3. Sets Redis `bot_off = true`
4. Sets lead `estado = "derivado"`
5. Responde al cliente con mensaje de cierre

### System Prompt estructura

```
[IDENTITY LOCK — INMUTABLE]
Sos el asistente de pre-venta de {nombre_concesionaria}.
Tu misión: entender qué necesita el cliente, recopilar datos clave
y conectarlo con el equipo. No cerrás ventas — preparás el terreno.
NUNCA inventes precios, cuotas ni datos de inventario.

[PERSONALIDAD]
{instruccionesVenta} | {reglasAgente}

[CONTEXTO DEL CLIENTE]
{bloque_contexto generado por Construir Prompt Block}

[INVENTARIO DISPONIBLE]
{top 20 vehículos del tenant, formato compacto}

[REGLAS DE HERRAMIENTA]
- SIEMPRE llamar buscar_vehiculos antes de mencionar un auto
- Cuotas: solo con auto definido + anticipo/presupuesto declarado
- Si el cliente quiere hablar con alguien: llamar derivar_a_vendedor
- Si operacion = "admin" o "papeles": llamar derivar_a_vendedor inmediatamente

[ESTILO]
- WhatsApp: respuestas cortas, máx 3 párrafos
- Voseo rioplatense
- Sin listas con guiones, sin markdown
- 1-2 emojis máximo
```

---

## Guardar Contexto

Post-processing después del Agent. Code node que:
1. Toma el lead mergeado del turno actual
2. Detecta si el Agent usó `derivar_a_vendedor` → actualiza `estado`
3. Detecta si el Agent mostró una ficha con precio → guarda en lead para no repetir
4. Guarda `{chat_id}:lead` en Redis con TTL 72h
5. Hace POST a `/api/leads` en FangioBot (upsert)

---

## Comparación v1 vs v2

| Aspecto | v1 | v2 |
|---|---|---|
| Nodos totales | 45 | ~24 |
| Ramas paralelas | Sí (4) | No |
| Merge node | Necesario (faltaba) | No necesario |
| Keys Redis por chat | 4 | 2 |
| Regex en código | Sí (Guardia Permuta) | No |
| Guardias como nodos | 3 | 0 |
| Router/Switch | Sí | No |
| proximo_objetivo | Hardcodeado | Dinámico |
| Historial de chat | No cargaba | Simple Memory + lead |
| Estado del lead | Disperso | Un solo objeto |

---

## Roadmap de Implementación v2

### 🔄 Sprint 6 — Refactor Base (próximo)

- [ ] Obtener API key de n8n.fangiocrm.com
- [ ] Exportar workflow actual como backup
- [ ] Reemplazar 4 branches paralelos + Construir por:
  - `Redis GET Lead` (un nodo, una key)
  - `GET Tenant Context` (HTTP, secuencial)
- [ ] Fix urgente: `Normalizar Payload` → `.json.body || .json`
- [ ] Fix urgente: Evolution webhook interno (`http://fangiocrm-n8n-master:5678/...`) ✅ HECHO

### 🔄 Sprint 7 — Extractor + Merge Lead

- [ ] Nuevo nodo: `Extractor LLM Nano` (prompt de extracción estructurada)
- [ ] Nuevo nodo: `Merge Lead` (Code, aplica updates sin pisar valores existentes)
- [ ] Eliminar: `Clasificador LLM Nano` (reemplazado por Extractor)
- [ ] Eliminar: `Router Determinístico` + `Switch Ruta`
- [ ] Eliminar: `Guardia Permuta`, `Guardia Anticipo`, `Guardia Papeles`

### 🔄 Sprint 8 — Prompt Block Dinámico

- [ ] Nuevo nodo: `Construir Prompt Block` con `proximo_objetivo` dinámico
- [ ] Implementar lógica completa por operación (compra/permuta/venta/admin)
- [ ] Actualizar system prompt del AI Agent (estructura de 4 bloques v2)
- [ ] Tool `derivar_a_vendedor` actualizada: recibe lead completo, formatea resumen para vendedor

### 🔄 Sprint 9 — Guardar Contexto + CRM

- [ ] Nuevo nodo: `Guardar Contexto` (reemplaza `Post AI Agent` + `Preparar Lead Data`)
- [ ] POST a `/api/leads` con el lead estructurado del turno
- [ ] Verificar upsert en dashboard FangioBot

### 🔄 Sprint 10 — Testing end-to-end

- [ ] Test flujo compra completo (con y sin saber el auto)
- [ ] Test flujo permuta (recopilar datos del auto a entregar)
- [ ] Test flujo venta
- [ ] Test flujo admin (derivación inmediata)
- [ ] Test filtro curiosos (cliente que no da datos, da vueltas)
- [ ] Validar que el bot no repregunta datos ya dados en turno anterior

---

## Bugs documentados en v1 (no reparados)

- `Normalizar Payload`: lee `$input.first().json` → debe ser `.json.body || .json`
- 4 branches paralelos sin Merge: Code node se dispara antes de que terminen todos
- `Guardia Anticipo`: dólar hardcodeado a 1300 (Sprint 5 decía que lo arreglaban pero no está)
- `Guardia Anticipo`: no tiene rama "monto suficiente → AI Agent" (siempre devuelve anticipo_insuficiente)
- Historial de chat (nodo 8d del Blueprint original): nunca se implementó
- Evolution webhook: usaba URL pública → NAT hairpinning timeout → usar URL interna Docker ✅ RESUELTO

Ver: [[Docker_Networking_Gotchas]] para el problema de NAT hairpinning.
