# Plan Activo: Fix clasificacion de leads, alertas duplicadas y handoff a humano

## Specs de referencia
- [2026-02-19-fix-clasificacion-leads-alertas-duplicadas.md](../../specs/2026-02-19-fix-clasificacion-leads-alertas-duplicadas.md)

## Objetivo
Corregir el sistema de clasificacion de leads y alertas en el workflow Trebol para que:
1. No se envien alertas prematuras a vendedores
2. Las alertas de pedidos no se dupliquen
3. Cuando el bot derive a un humano, el bot deje de responder automaticamente
4. El bot sepa que hay motos, acuaticos, camiones y maquinaria en el inventario

## Estado actual
Los 5 cambios fueron aplicados y validados en TEST. Listos para deploy a PROD.

## Workflow target
- **Test**: `F7199DA4-B24C-4395-84CE-1F45D01ACFAC` (Trebol en test n8n) — CAMBIOS APLICADOS Y VALIDADOS ✅
- **Prod**: `wf4ts1WKcpOaE90A__FkD` (Trebol en prod n8n) — PENDIENTE DE DEPLOY

## Resumen de cambios (5 total)

| # | Cambio | Tipo | Nodo afectado | Hardcodes |
|---|--------|------|---------------|-----------|
| 1 | Fix alertas duplicadas pedidos | Workflow (agregar condicion) | `Switch Lead Logic` | Ninguno |
| 2 | Reglas de temperatura estrictas | Prompt change | `Extraer Datos CRM` | Ninguno |
| 3 | Quitar "marcar caliente" del AI Agent | Prompt change (eliminar lineas) | `AI Agent` | Ninguno |
| 4 | Handoff automatico a humano | Workflow (3 nodos nuevos) | `Detectar Handoff`, `If Handoff`, `Set Bot Off` | Ninguno — usa misma credential Postgres y dblink |
| 5 | Tipos de vehiculo en inventario | Prompt change (agregar lineas) | `AI Agent` | Ninguno |

**Verificado: ningún cambio tiene valores hardcodeados de entorno. Todo usa `$env`, referencias dinamicas a nodos, y la credencial Postgres compartida (misma ID en test y prod). dblink ya instalado en ambos entornos.**

---

## Pre-flight checklist (para deploy a PROD)

- [ ] Exportar backup del workflow Trebol de prod como JSON desde la UI de n8n
- [ ] Verificar que el workflow Trebol de prod esta activo
- [ ] Verificar que la extension dblink esta instalada en prod: `docker exec trebol-prod-postgres psql -U postgres -d postgres -c "SELECT * FROM pg_extension WHERE extname = 'dblink';"`
- [ ] Verificar que la credential `Postgres account` (ID: GM66VV4J8REHVNaD) existe en prod

---

## CAMBIO 1: Fix alertas duplicadas en pedidos (Switch Lead Logic)

### Que cambiar
En el nodo `Switch Lead Logic`, la rama "Pedido" no verifica `ALERTA_ENVIADA`. Las ramas "Lead Caliente" y "Papeles" si lo hacen.

### Cambio exacto
Agregar segunda condicion AND a la rama "Pedido":

```
ANTES:
  Rama "Pedido":  ESTADO DEL CLIENTE == "pedido"

DESPUES:
  Rama "Pedido":  ESTADO DEL CLIENTE == "pedido" AND ALERTA_ENVIADA == "no"
```

### Como hacerlo en la UI de PROD
1. Abrir workflow Trebol → nodo `Switch Lead Logic`
2. En la primera rama ("Pedido"), click "Add condition"
3. Left value: `{{ $json.ALERTA_ENVIADA }}`
4. Operation: `equals`
5. Right value: `no`
6. Guardar

---

## CAMBIO 2: Prompt de Extraer Datos CRM (clasificacion de temperatura)

### Que cambiar
Reemplazar las reglas de temperatura en el prompt del nodo `Extraer Datos CRM`.

### Prompt COMPLETO de la seccion de temperatura
Reemplazar desde `**REGLAS DE TEMPERATURA` hasta justo antes de `**AUTO DE INTERES (CRÍTICO):**`

```
**REGLAS DE TEMPERATURA:**

**REGLA PRINCIPAL: LA TEMPERATURA POR DEFECTO ES SIEMPRE "tibio". Solo cambiala si estás 100% seguro de que aplica uno de los casos de abajo.**

temperatura = "pedido" SOLO SI:
- El auto que busca NO está en stock, Y
- El vendedor le ofreció avisarle cuando ingrese uno, Y
- El cliente RESPONDIÓ "sí", "dale", "bueno" a esa oferta (NO basta con que el vendedor ofrezca, el cliente tiene que haber aceptado), Y
- El cliente ya dijo su nombre.
Si falta CUALQUIERA de estas 4 condiciones → "tibio".

temperatura = "no_interesa" SOLO SI:
- El cliente dijo EXPLÍCITAMENTE "no me interesa", "paso", "muy caro", "no llego", o similar rechazo claro.

temperatura = "papeles" SOLO SI:
- El cliente pregunta por trámites: 08, cédula, transferencia del auto, papeles, documentación, verificación policial, patente, VTV, RTO.

temperatura = "caliente" SOLO SI ocurre EXACTAMENTE uno de estos 3 casos (y NINGÚN otro):
- CASO 1 - CUOTAS: El cliente preguntó LITERALMENTE por cuotas ("cuántas cuotas", "en cuotas", "cuánto por mes"). OJO: "financiación" a secas NO es caliente.
- CASO 2 - VISITA: El cliente dijo LITERALMENTE que quiere ir a la concesionaria ("quiero ir", "puedo pasar", "voy mañana"). OJO: preguntar dirección NO es caliente.
- CASO 3 - FOTOS PERMUTA: El vendedor le pidió fotos del auto que el cliente quiere permutar/vender. OJO: que el cliente mencione permuta NO es caliente, solo cuando el vendedor ya le pidió fotos.

SI NO ENCAJA EN NINGUNO DE LOS 3 CASOS DE ARRIBA → "tibio". No inventes motivos para poner "caliente".

temperatura = "frio" SOLO SI:
- Es un saludo suelto sin ninguna intención ("hola", "buenas" y nada más).

EN CASO DE DUDA → "tibio". SIEMPRE "tibio" por defecto.
```

### Como hacerlo en la UI de PROD
1. Abrir workflow Trebol → nodo `Extraer Datos CRM`
2. En el campo de texto del prompt, buscar `**REGLAS DE TEMPERATURA`
3. Seleccionar desde ahi hasta justo antes de `**AUTO DE INTERES (CRÍTICO):**`
4. Reemplazar con el bloque de arriba
5. Guardar

---

## CAMBIO 3: Limpiar prompt del AI Agent (quitar "marcar caliente")

### Que cambiar
El system prompt del AI Agent tiene instrucciones de "Marcar estado_cliente como caliente" que confunden al LLM porque el formato de salida no tiene ese campo.

### Cambios exactos (buscar y ELIMINAR estas lineas):

**En REGLA 1 (Temas administrativos):**
```
ELIMINAR:  Marcar estado_cliente como "caliente".
```

**En REGLA 2 (Hablar con persona especifica):**
```
ELIMINAR:  Marcar estado_cliente como "caliente".
```

**En REGLA 3 (Mensajes fuera de tema):**
```
ELIMINAR:  Marcar estado_cliente como "caliente".
```

**En la seccion NEGOCIACION (si el cliente dice SI a contacto con vendedor):**
```
ELIMINAR:  Marcar estado_cliente como "caliente".
```

### Como hacerlo en la UI de PROD
1. Abrir workflow Trebol → nodo `AI Agent` → System Message
2. Ctrl+F buscar "estado_cliente"
3. Eliminar cada linea que contenga `Marcar estado_cliente como "caliente"`
4. Verificar que se eliminaron 4 ocurrencias
5. NO eliminar nada mas — el resto del comportamiento queda igual
6. Guardar

---

## CAMBIO 4: Handoff automatico (bot deja de responder despues de derivar)

### Que agregar
3 nodos nuevos que detectan cuando el agente deriva a un humano y ponen `bot: "off"` en la DB de Chatwoot para esa conversacion.

### Prerequisito (ya cumplido)
La extension `dblink` debe estar instalada en PostgreSQL:
```sql
CREATE EXTENSION IF NOT EXISTS dblink;
```
Ya esta instalada en test y prod.

### Nodo 1: Detectar Handoff (Code node)
**Tipo:** n8n-nodes-base.code v2

```javascript
const mensaje = (($('Parse Chain Output').first().json.output || {}).mensaje1 || '').toLowerCase();

const frasesHandoff = [
  'te pongo en contacto con',
  'ya te pongo en contacto',
  'ya le avisé a un asesor',
  'ya le aviso a un asesor',
  'un vendedor de la agencia',
  'su respuesta puede no ser inmediata',
  'te escribirán en breve',
  'te escribiran en breve'
];

const esHandoff = frasesHandoff.some(f => mensaje.includes(f));

return [{ json: { esHandoff } }];
```

### Nodo 2: If Handoff (If node)
**Condicion:** `{{ $json.esHandoff }}` is true (boolean)

### Nodo 3: Set Bot Off (Postgres node)
**Tipo:** n8n-nodes-base.postgres v2.5
**Operacion:** Execute Query
**Credencial:** `Postgres account` (misma que usa el nodo Postgres existente — ID: `GM66VV4J8REHVNaD`, existe en test y prod)
**Query (DEBE SER UNA SOLA LÍNEA, sin saltos de línea):**
```
=SELECT dblink_exec('dbname=chatwoot user=postgres', 'UPDATE conversations SET custom_attributes = ''{"bot":"off"}'' WHERE id = {{ $("Edit Fields").first().json.converssation_ID }}')
```
**NOTA:** Usar comillas dobles `$("Edit Fields")` en la expresion n8n, NO comillas simples. Y copiar todo en UNA sola linea.

**Sobre los valores `dbname=chatwoot` y `user=postgres` en la query:**
Estos NO son hardcodes de entorno. Son nombres de infraestructura identicos en test y prod (definidos en los docker-compose). La credencial Postgres se encarga de conectar al servidor correcto de cada entorno; el dblink solo indica a que base de datos dentro de ese servidor ir.

**Por que no usar la API de Chatwoot:** La API PATCH de Chatwoot v3.13.0 no actualiza `custom_attributes` correctamente (bug conocido, verificado en test). El update via SQL con dblink es confiable y esta probado en ambos entornos.

### Conexiones
```
HTTP Request (envia mensaje a Chatwoot)
    ├── Postgres (existente, no tocar)
    ├── If3 (existente, no tocar)
    └── Detectar Handoff (NUEVO)
            └── If Handoff (NUEVO)
                  ├─ TRUE → Set Bot Off (NUEVO)
                  └─ FALSE → (nada, termina)
```

### Como hacerlo en la UI de PROD
1. Crear nodo Code "Detectar Handoff" → pegar el codigo de arriba
2. Crear nodo If "If Handoff" → condicion: `{{ $json.esHandoff }}` is true (boolean)
3. Crear nodo Postgres "Set Bot Off" → operacion: Execute Query → credencial: Postgres account → pegar la query de arriba
4. Conectar salida de `HTTP Request` (el existente que envia mensajes a Chatwoot) → `Detectar Handoff`
5. Conectar `Detectar Handoff` → `If Handoff`
6. Conectar `If Handoff` (true) → `Set Bot Off`
7. Las conexiones existentes de HTTP Request (→ Postgres, → If3) NO se tocan

---

## CAMBIO 5: AI Agent — agregar tipos de vehiculo al prompt

### Que cambiar
El AI Agent no sabe que el inventario incluye motos, acuaticos, camiones y maquinaria. Asume que solo hay autos y responde "solo tenemos autos" sin buscar.

### Cambio 5a: Seccion HERRAMIENTAS
Buscar en el System Prompt del AI Agent:
```
HERRAMIENTAS:
No tenés inventario en memoria. Todo sale de buscar_inventario_autos.
```

Reemplazar por:
```
HERRAMIENTAS:
No tenés inventario en memoria. Todo sale de buscar_inventario_autos.
IMPORTANTE: La herramienta buscar_inventario_autos busca en TODO el inventario, no solo autos. Incluye motos, acuáticos, camiones y maquinaria. SIEMPRE usá esta herramienta cuando el cliente pregunte por CUALQUIER tipo de vehículo. NUNCA digas "solo tenemos autos" sin haber buscado primero.
```

### Cambio 5b: Seccion REGLAS DE BÚSQUEDA Y RECOMENDACIÓN
Agregar regla 6 al final de la lista (despues de la regla 5):
```
  6. TIPOS DE VEHÍCULO: El inventario incluye autos, motos, acuáticos, camiones y maquinaria. NO asumas que solo hay autos. Si el cliente pregunta por motos, camiones, acuáticos o maquinaria, BUSCÁ en la herramienta. NUNCA digas que no tenemos un tipo de vehículo sin buscar primero. PROHIBIDO mencionar los tipos de vehículo proactivamente — solo respondé sobre el tipo que el cliente preguntó.
```

### Como hacerlo en la UI de PROD
1. Abrir workflow Trebol → nodo `AI Agent` → System Message
2. Buscar "HERRAMIENTAS:" → agregar el parrafo de IMPORTANTE despues de la linea existente
3. Buscar "REGLAS DE BÚSQUEDA Y RECOMENDACIÓN:" → agregar regla 6 despues de la regla 5
4. Guardar

---

## Testing (en test, antes de deployar a prod)

Antes de cada test, ejecutar:
```bash
/root/kairos-infrastructure/scripts/clear-chat-memory.sh 5491150635028 test
```

| # | Test | Resultado esperado | Estado |
|---|------|-------------------|--------|
| T1 | "Hola, tienen Hilux?" → dar nombre → conversar | Temperatura: tibio. Sin alertas. | ⏳ |
| T2 | "Cuantas cuotas puedo pagar?" | Temperatura: caliente. Alerta enviada. | ⏳ |
| T3 | Preguntar auto sin stock → bot ofrece avisar → "dale" → dar nombre | Temperatura: pedido. Alerta con nombre. | ⏳ |
| T4 | Preguntar auto sin stock → bot ofrece avisar → (NO responder) | Temperatura: tibio. Sin alerta. | ⏳ |
| T5 | Conversacion donde bot dice "te pongo en contacto con vendedor" | Bot deja de responder mensajes siguientes (bot=off en Chatwoot). | ⏳ |
| T6 | Cliente "pedido" existente con ALERTA_ENVIADA="si" → nuevo mensaje | Sin alerta duplicada. | ⏳ |
| T7 | "Me interesa financiar" | Temperatura: tibio. Bot responde (no caliente). | ⏳ |
| T8 | "Tienen motos?" | Bot BUSCA en inventario y muestra motos (no dice "solo autos"). | ⏳ |

---

## Deploy a prod (DESPUES de validar todos los tests)

| # | Accion | Rollback | Estado |
|---|--------|----------|--------|
| D0 | Exportar backup del workflow Trebol de prod como JSON | Restaurar JSON | ⏳ |
| D1 | Aplicar CAMBIO 1 (Switch Lead Logic) en prod | Quitar condicion agregada | ⏳ |
| D2 | Aplicar CAMBIO 2 (prompt Extraer Datos CRM) en prod | Restaurar prompt original del backup | ⏳ |
| D3 | Aplicar CAMBIO 3 (limpiar AI Agent prompt) en prod | Restaurar lineas eliminadas del backup | ⏳ |
| D4 | Aplicar CAMBIO 4 (3 nodos handoff) en prod | Eliminar los 3 nodos | ⏳ |
| D5 | Aplicar CAMBIO 5 (tipos de vehiculo en AI Agent prompt) en prod | Restaurar prompt original del backup | ⏳ |
| D6 | Monitorear primeras 10 conversaciones en prod | Rollback si hay falsos negativos | ⏳ |

---

## Notas importantes para el executor
- Los 5 cambios ya estan validados en test. El deploy a prod consiste en replicar los mismos cambios en la UI de n8n prod.
- Los cambios 1, 2, 3 y 5 son cambios de texto/configuracion en nodos existentes → se hacen en la UI de n8n prod.
- El cambio 4 requiere crear 3 nodos nuevos y conectarlos → se hace en la UI de n8n prod.
- **Set Bot Off usa un nodo Postgres** (no HTTP Request). Usa la credencial `Postgres account` que ya existe en prod con el mismo ID. Usa `dblink` para hacer update cross-database, ya instalado en prod.
- Los valores `dbname=chatwoot` y `user=postgres` en la query de dblink son nombres de infraestructura fijos e identicos en ambos entornos — no son hardcodes de entorno.
- El script `clear-chat-memory.sh` borra la memoria de un numero en la tabla `n8n_chat_histories` (DB `postgres`, NO `n8n`).
- **BACKUP OBLIGATORIO** antes de tocar prod: exportar JSON del workflow desde la UI de n8n prod.
