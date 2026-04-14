# Plan: AI Tester — Suite de Regression Testing Basada en Conversaciones Reales

**Fecha:** 2026-03-05
**Estado:** DRAFT — pendiente aprobacion
**Entorno:** TEST (`test-trebol.n8n.kairosaisolutions.com`)
**Tipo:** Script de testing + fixtures de conversaciones + verificacion automatizada
**Scope:** SOLO testing. No RAG, no embeddings, no MongoDB nuevo.

---

## 1. Resumen Ejecutivo

### Que es

Una suite de regression tests que crea conversaciones reales en Chatwoot TEST, envia mensajes al webhook de n8n TEST simulando el payload de Chatwoot (usando conversation_id numerico real), espera las respuestas del bot via Chatwoot API, y verifica automaticamente que el bot responda correctamente segun criterios definidos por conversaciones reales de produccion.

### Para que sirve

Acelerar el ciclo de desarrollo de Trebol v3. Hoy el flujo es:

```
Cambiar JSON → Deploy a test → Abrir WhatsApp → Escribir manualmente → Leer respuesta → Decidir si esta bien → Repetir
```

Con el tester:

```
Cambiar JSON → Deploy a test → ./scripts/run-tests.sh → Ver resultados (PASS/FAIL) → Fix → Repetir
```

### Que NO es

- NO es un pipeline RAG conversacional
- NO es un nuevo workflow de n8n
- NO genera embeddings ni escribe en MongoDB
- NO lee de Chatwoot PROD
- NO modifica el workflow de produccion

Es un script de testing que simula clientes enviando mensajes y verifica las respuestas del bot.

---

## 2. Fuente de Datos: Conversaciones Reales

### Conversaciones buenas (CB-01 a CB-07) — Referencia de comportamiento correcto

Extraidas de `docs/ConverBuenas.md`. Definen como DEBE responder el bot.

| ID | Escenario | Comportamiento correcto clave |
|----|-----------|-------------------------------|
| CB-01 | ML link Ford F100 | Ficha correcta, fotos, pregunta de seguimiento |
| CB-02 | ML link Hilux + permuta + handoff | Multiples resultados, detecto permuta, pidio nombre, handoff limpio |
| CB-03 | Papeles (deuda) | Auto-respuesta, derivacion inmediata, no intento responder |
| CB-04 | ML link Ram 1500 + precio desactualizado | Manejo de diferencia de precio sin confrontar |
| CB-05 | ML link SW4 + permuta con lote | Rechazo lote correctamente, cierre limpio |
| CB-06 | ML link Sprinter + flujo completo | Ficha, ubicacion, financiacion, handoff — flujo ideal |
| CB-07 | SW4 + pedido de aviso (no stock 2022/2023) | Respondio pregunta tecnica, respeto "no hace falta", ofrecio aviso |

### Conversaciones malas (CM-01 a CM-07) — Errores que NO deben repetirse

Extraidas de `docs/ConverMalas.md`. Definen que NO debe hacer el bot.

| ID | Error critico | Prohibicion |
|----|---------------|-------------|
| CM-01 | "Podemos tomar tu Fiat Idea" | NO prometer toma ni evaluar permuta |
| CM-02 | "pido 30000" interpretado como presupuesto | NO confundir precio de permuta con presupuesto de compra |
| CM-03 | Mostro alternativas Ford cuando pidio Mustang | NO mostrar alternativas cuando no hay stock — solo proponer pedido |
| CM-04 | JSON crudo enviado al cliente | Parser debe manejar JSON duplicado sin enviar texto crudo |
| CM-05 | "si avisame" triggero busqueda por presupuesto | "si" al aviso debe registrar pedido, NO buscar por presupuesto |
| CM-06 | Ofrecio cuotas sin vehiculo elegido | NO ofrecer financiacion sin vehiculo en stock elegido |
| CM-07 | Mensajes en orden incorrecto | mensaje1 debe llegar antes que mensaje2 |

---

## 3. Arquitectura del Tester

### Approach: Hibrido (Chatwoot API + POST al webhook)

El tester necesita resolver 3 requisitos simultaneos:

1. **`conversation.id` debe ser numerico real**: El bot usa `conversation.id` para responder via Chatwoot API (`POST /conversations/{conv_id}/messages`). Si el conversation_id no existe en Chatwoot, la respuesta se pierde.

2. **`sender.identifier` debe ser unico por test**: El bot usa `sender.identifier` como `chat_id` para Redis keys (`v3:{chat_id}:buffer`, `v3:{chat_id}:processing`, `v3:{chat_id}:conv_state`). Si dos tests comparten identifier, sus Redis keys colisionan.

3. **El webhook debe disparar**: Crear mensajes via Chatwoot REST API no garantiza que el webhook de Chatwoot dispare hacia n8n. POST directo al webhook de n8n garantiza ejecucion.

**Solucion:** Para cada test, crear contacto + conversacion reales en Chatwoot TEST via API (obteniendo un `conversation_id` numerico), luego POST al webhook de n8n con ese conversation_id numerico real y un `sender.identifier` unico por test.

**Justificacion de opciones evaluadas:**

| Opcion | Pros | Contras |
|--------|------|---------|
| Hibrido (Chatwoot API + webhook directo) | conv_id numerico real, chat_id unico, control total, bot puede responder a Chatwoot | Requiere crear contacto+conversacion pre-test |
| POST directo sin Chatwoot | Simple, sin dependencias | conv_id fake (bot no puede responder), `jq tonumber` crashea con strings |
| Chatwoot API puro | Round-trip parcial | `sender.identifier` null, webhook podria no disparar |
| Evolution API TEST | Round-trip real completo | Requiere numero WhatsApp conectado, lento, fragil |

### Flujo del tester

```
scripts/run-tests.sh
  |
  +-- 1. Leer fixtures de tests/fixtures/*.json
  |
  +-- 2. Para cada test:
  |     +-- a. Crear contacto en Chatwoot TEST (POST /contacts)
  |     |     -> Obtener contact_id
  |     +-- b. Crear conversacion en Chatwoot TEST (POST /conversations)
  |     |     -> Obtener conversation_id (numerico real)
  |     +-- c. Generar sender.identifier unico: test-{timestamp}-{pid}-{test_id}
  |     +-- d. Enviar mensaje(s) del cliente via POST directo al webhook de n8n
  |     |     (payload usa conversation.id = numerico real, sender.identifier = unico)
  |     +-- e. Esperar N segundos (debounce + AI processing)
  |     +-- f. Leer respuesta(s) del bot via Chatwoot API
  |     |     GET /conversations/{conversation_id}/messages
  |     |     Filtrar por message_type == 1 (outgoing = bot)
  |     +-- g. Evaluar respuesta contra criterios (MUST contain / MUST NOT contain)
  |     +-- h. Cleanup: resolver conversacion en Chatwoot (no acumular basura)
  |     +-- i. Registrar resultado: PASS / FAIL + detalle
  |
  +-- 3. Imprimir resumen: X/Y tests passed
```

### Interaccion con el sistema

```
Script (run-tests.sh)
  |
  | 1. POST Chatwoot TEST API: crear contacto + conversacion
  |    -> conversation_id (numerico real, ej: 847)
  v
Script
  |
  | 2. POST directo al webhook de n8n TEST
  |    payload: conversation.id = 847, sender.identifier = "test-1709654321-12345-TM-03"
  v
n8n TEST (Trebol v3 Test workflow)
  |
  | Procesa -> debounce Redis (key: v3:test-1709654321-12345-TM-03:buffer)
  | -> clasificacion -> AI Agent -> Respuesta
  | POST a Chatwoot TEST: /conversations/847/messages (funciona porque conv 847 existe)
  v
Chatwoot TEST
  |
  | GET /conversations/847/messages (script lee respuesta, filtra message_type == 1)
  v
Script (evalua respuesta)
  |
  | PATCH /conversations/847 { status: "resolved" } (cleanup)
  v
Done
```

---

## 4. Suite de Tests

### Tests de conversaciones buenas (el bot debe seguir haciendo esto bien)

#### TB-01: ML link con vehiculo en stock

**Basado en:** CB-01 (Ford F100 1969)
**Objetivo:** Verificar que un ML link con vehiculo en stock devuelve ficha correcta

```json
{
  "id": "TB-01",
  "name": "ML link con vehiculo en stock",
  "messages": [
    "Hola, tengo algunas preguntas sobre Ford F100 1969 6 Cilindros Automatica. https://auto.mercadolibre.com.ar/MLA-2622886764-ford-f100-1969-6-cilindros-automatica-_JM"
  ],
  "wait_seconds": 20,
  "must_contain": [
    "stock",
    "F100"
  ],
  "must_contain_any": ["Contado", "contado", "U$S", "USD"],
  "must_not_contain": [],
  "must_have_photos": true,
  "max_messages": 3
}
```

#### TB-02: ML link + permuta -> derivacion sin prometer

**Basado en:** CB-02 (Toyota Hilux + permuta)
**Objetivo:** Verificar que permuta se deriva correctamente sin prometer toma

```json
{
  "id": "TB-02",
  "name": "ML link + permuta derivacion",
  "messages": [
    "Hola, tengo algunas preguntas sobre Toyota Hilux Pick-up 2.8 Cd Sr 177cv 4x4. https://auto.mercadolibre.com.ar/MLA-1666922195",
    "__WAIT_20__",
    "Toman usados parte de pago...el resto de ctdo."
  ],
  "wait_seconds": 20,
  "must_contain_any": ["administracion", "administracion", "asesor", "vendedor", "contacto"],
  "must_not_contain": ["podemos tomar", "Podemos tomar", "evaluar tu", "evaluamos", "tendriamos que evaluar"],
  "must_have_photos": false
}
```

#### TB-03: Papeles -> auto-respuesta + derivacion

**Basado en:** CB-03 (deuda en vehiculo)
**Objetivo:** Verificar que papeles se auto-responde y deriva

```json
{
  "id": "TB-03",
  "name": "Papeles auto-respuesta",
  "messages": [
    "Buenas. Como va! Mande a pedir unos informes de la doblo y tiene deuda vieja. Puede ser?"
  ],
  "wait_seconds": 20,
  "must_contain_any": ["administracion", "administracion"],
  "must_not_contain": ["deuda", "informe", "transferencia"],
  "max_messages": 2
}
```

#### TB-04: Precio desactualizado -> derivar sin explicar

**Basado en:** CB-04 (Ram 1500 + precio ML vs agencia)
**Objetivo:** Verificar que diferencia de precio se maneja sin confrontar

```json
{
  "id": "TB-04",
  "name": "Precio desactualizado manejo",
  "messages": [
    "Hola, tengo algunas preguntas sobre Ram 1500 5.7 Laramie Atx V8. https://auto.mercadolibre.com.ar/MLA-1599704057",
    "__WAIT_20__",
    "Pense que era el precio publicado muchas gracias"
  ],
  "wait_seconds": 20,
  "must_not_contain": ["el precio de MercadoLibre es incorrecto", "el anuncio esta mal", "error en el precio"]
}
```

#### TB-05: Lote como permuta -> rechazar correctamente

**Basado en:** CB-05 (SW4 + lote como parte de pago)
**Objetivo:** Verificar que lote se rechaza segun politica

```json
{
  "id": "TB-05",
  "name": "Lote como permuta rechazo",
  "messages": [
    "Hola, tengo algunas preguntas sobre Toyota Sw4 2.8 Srx 204cv 4x4 7as At. https://auto.mercadolibre.com.ar/MLA-2709609006",
    "__WAIT_20__",
    "Aceptas un lote como parte de pago?"
  ],
  "wait_seconds": 20,
  "must_not_contain": ["podemos", "evaluar el lote", "aceptamos lote"],
  "must_contain_any": ["no esta contemplado", "no contemplado", "no aceptamos", "solo vehiculos", "solo vehiculos", "no es posible"]
}
```

#### TB-06: Flujo completo hasta handoff

**Basado en:** CB-06 (Sprinter -> ubicacion -> financiacion -> handoff)
**Objetivo:** Verificar flujo completo multi-turno

```json
{
  "id": "TB-06",
  "name": "Flujo completo hasta handoff",
  "messages": [
    "Hola, tengo algunas preguntas sobre Mercedes-benz Sprinter 2.1 411 Street 116cv 3250 V2 Tn. https://auto.mercadolibre.com.ar/MLA-2638644492",
    "__WAIT_20__",
    "Ubicacion",
    "__WAIT_20__",
    "Me faltan 2500 dolares",
    "__WAIT_20__",
    "Esa me parece que esta buena. Puedo financiar el saldo?",
    "__WAIT_20__",
    "Si conectame con un asesor"
  ],
  "wait_seconds": 20,
  "must_contain_any": ["asesor", "vendedor", "contacto", "te escribiran", "te escribiran"],
  "must_not_contain": ["cualquier cosa estoy", "estoy para ayudarte", "estoy a disposicion"]
}
```

#### TB-07: No stock + pedido de aviso

**Basado en:** CB-07 (SW4 2022/2023 no en stock)
**Objetivo:** Verificar que ofrece aviso y registra pedido

```json
{
  "id": "TB-07",
  "name": "No stock pedido de aviso",
  "messages": [
    "holaaa",
    "__WAIT_20__",
    "tienen toyota sw4 2022?"
  ],
  "wait_seconds": 20,
  "must_contain_any": ["no tenemos", "No tenemos", "no hay"],
  "must_contain_any_2": ["anotar", "avisar", "avisamos", "pedido", "lista"],
  "must_not_contain": ["alternativas", "te recomiendo", "opciones disponibles"]
}
```

### Tests de conversaciones malas (el bot NO debe repetir estos errores)

#### TM-01: Permuta -> NO prometer toma ni evaluar

**Basado en:** CM-01 (Fiat Idea como permuta)
**Objetivo:** Verificar que NUNCA promete tomar un auto

```json
{
  "id": "TM-01",
  "name": "Permuta NO prometer toma",
  "messages": [
    "Hola, tengo algunas preguntas sobre Ford Fiesta Se Plus. https://auto.mercadolibre.com.ar/MLA-2707252734",
    "__WAIT_20__",
    "quisiera saber si toman un Fiat Idea 1.8 HLX 2006 en parte de pago. tiene 230000km y equipo a gas"
  ],
  "wait_seconds": 20,
  "must_not_contain": [
    "podemos tomar",
    "Podemos tomar",
    "tendriamos que evaluar",
    "evaluamos tu",
    "evaluar el estado",
    "cotizar tu",
    "tomamos tu"
  ],
  "must_contain_any": ["administracion", "administracion", "asesor", "vendedor"]
}
```

#### TM-02: "pido X por mi auto" -> NO interpretar como presupuesto

**Basado en:** CM-02 (Amarok + "pido 30000 por mi Sentra")
**Objetivo:** Verificar que "pido X" por un auto de permuta no se confunde con presupuesto de compra

```json
{
  "id": "TM-02",
  "name": "Precio permuta vs presupuesto",
  "messages": [
    "hola amarok tienen en stock?",
    "__WAIT_20__",
    "tengo 50000 usd",
    "__WAIT_20__",
    "tengo para entregar un nissan sentra 250000km",
    "__WAIT_20__",
    "pido 30000 usd por el"
  ],
  "wait_seconds": 20,
  "must_not_contain": [
    "por menos de U$S 30.000",
    "por menos de 30.000",
    "presupuesto de 30"
  ],
  "must_contain_any": ["administracion", "administracion", "asesor", "permuta", "Sentra", "sentra"]
}
```

#### TM-03: No stock -> NO mostrar alternativas

**Basado en:** CM-03 (Ford Mustang PROD)
**Objetivo:** Verificar que cuando no hay stock NO muestra otros autos

```json
{
  "id": "TM-03",
  "name": "No stock SIN alternativas",
  "messages": [
    "holaaa",
    "__WAIT_20__",
    "ford mustang tienen?"
  ],
  "wait_seconds": 20,
  "must_contain_any": ["no tenemos", "No tenemos"],
  "must_contain_any_2": ["anotar", "avisar", "avisamos", "pedido", "lista"],
  "must_not_contain": [
    "Bronco",
    "Maverick",
    "F100",
    "opciones Ford",
    "alternativas"
  ]
}
```

#### TM-04: JSON crudo -> parser debe manejar sin enviar texto crudo

**Basado en:** CM-04 (Toyota Corolla JSON crudo)
**Objetivo:** Verificar que el parser no envia JSON crudo al cliente

```json
{
  "id": "TM-04",
  "name": "Parser anti JSON crudo",
  "messages": [
    "holaaa",
    "__WAIT_20__",
    "tienen toyota corolla?",
    "__WAIT_20__",
    "si"
  ],
  "wait_seconds": 20,
  "must_not_contain": [
    "{\"mensaje1\"",
    "\"fotos_mensaje1\"",
    "\"mensaje2\"",
    "{\"mensaje",
    "fotos_mensaje"
  ]
}
```

#### TM-05: "si avisame" -> registrar pedido, NO buscar por presupuesto

**Basado en:** CM-05 (Ford Mustang TEST)
**Objetivo:** Verificar que "si avisame" al aviso registra pedido y no busca alternativas

```json
{
  "id": "TM-05",
  "name": "Si avisame registra pedido",
  "messages": [
    "holaaa",
    "__WAIT_20__",
    "tienen ford mustang?",
    "__WAIT_20__",
    "en stock",
    "__WAIT_20__",
    "si avisame si entra uno",
    "__WAIT_20__",
    "mi presupuesto es de 90000 usd"
  ],
  "wait_seconds": 20,
  "must_not_contain": [
    "Tracker",
    "Vento",
    "Peugeot",
    "Honda Fit",
    "U$S 10",
    "U$S 13"
  ],
  "must_contain_any": ["anotamos", "avisamos", "registrado", "nombre", "te llamas", "te llamas"]
}
```

#### TM-06: No stock -> NO ofrecer cuotas sin vehiculo elegido

**Basado en:** CM-06 (Ford Mustang TEST v2)
**Objetivo:** Verificar que no ofrece financiacion sin vehiculo en stock elegido

```json
{
  "id": "TM-06",
  "name": "No cuotas sin vehiculo",
  "messages": [
    "holaaa",
    "__WAIT_20__",
    "tienen ford mustang?",
    "__WAIT_20__",
    "si por favor",
    "__WAIT_20__",
    "tengo 90000 usd"
  ],
  "wait_seconds": 20,
  "must_not_contain": [
    "simulacion de financiacion",
    "simulacion de financiacion",
    "cuotas",
    "financiar",
    "Bronco",
    "Maverick",
    "SW4"
  ]
}
```

#### TM-07: Mensajes en orden correcto

**Basado en:** CM-07 (Nissan Sentra orden invertido)
**Objetivo:** Verificar que mensaje1 llega antes que mensaje2

```json
{
  "id": "TM-07",
  "name": "Orden correcto de mensajes",
  "messages": [
    "holaaa tenes nissan sentra?"
  ],
  "wait_seconds": 20,
  "order_check": {
    "first_message_must_contain_any": ["no tenemos", "No tenemos", "Nissan Sentra"],
    "first_message_must_not_contain": ["avisemos", "avisamos", "avisar"]
  }
}
```

---

## 5. Criterios de Evaluacion

Para cada test, el evaluador aplica estas reglas en orden:

### Evaluacion automatica (script)

| Criterio | Tipo | Como se verifica |
|----------|------|------------------|
| `must_contain` | Array de strings | TODOS deben estar presentes en alguno de los mensajes del bot |
| `must_contain_any` | Array de strings | AL MENOS UNO debe estar presente |
| `must_contain_any_2` | Array de strings | AL MENOS UNO debe estar presente (segundo grupo) |
| `must_not_contain` | Array de strings | NINGUNO debe estar presente en ningun mensaje del bot |
| `must_have_photos` | Boolean | Si true, al menos 1 mensaje debe tener attachments |
| `max_messages` | Number | El bot no debe enviar mas de N mensajes |
| `order_check` | Object | Verifica que el primer mensaje del bot cumple sus propios criterios |

### Veredicto

```
PASS  = todos los criterios automaticos se cumplen
FAIL  = al menos 1 criterio falla
ERROR = el bot no respondio, o hubo error de red/timeout
```

### Lo que NO se evalua automaticamente (requiere review manual)

- Tono de la respuesta (suena natural vs robotico)
- Formato visual en WhatsApp (largo de mensaje, saltos de linea)
- Coherencia semantica profunda (el bot dice algo correcto pero fuera de contexto)

Estos se evaluan manualmente leyendo los logs de respuesta que el script genera.

---

## 6. Implementacion

### Archivos a crear

| Archivo | Descripcion |
|---------|-------------|
| `scripts/run-tests.sh` | Script principal del tester |
| `tests/fixtures/tb-01.json` | Fixture TB-01 (ML link stock) |
| `tests/fixtures/tb-02.json` | Fixture TB-02 (permuta derivacion) |
| `tests/fixtures/tb-03.json` | Fixture TB-03 (papeles) |
| `tests/fixtures/tb-04.json` | Fixture TB-04 (precio desactualizado) |
| `tests/fixtures/tb-05.json` | Fixture TB-05 (lote rechazo) |
| `tests/fixtures/tb-06.json` | Fixture TB-06 (flujo completo) |
| `tests/fixtures/tb-07.json` | Fixture TB-07 (no stock pedido) |
| `tests/fixtures/tm-01.json` | Fixture TM-01 (permuta no prometer) |
| `tests/fixtures/tm-02.json` | Fixture TM-02 (precio permuta vs presupuesto) |
| `tests/fixtures/tm-03.json` | Fixture TM-03 (no alternativas) |
| `tests/fixtures/tm-04.json` | Fixture TM-04 (anti JSON crudo) |
| `tests/fixtures/tm-05.json` | Fixture TM-05 (si avisame pedido) |
| `tests/fixtures/tm-06.json` | Fixture TM-06 (no cuotas sin vehiculo) |
| `tests/fixtures/tm-07.json` | Fixture TM-07 (orden mensajes) |
| `tests/results/` | Directorio para logs de resultados |

### Archivos que NO se modifican

Ningun workflow de n8n, ningun container Docker, ningun .env, ninguna base de datos.

### Script principal: `scripts/run-tests.sh`

```bash
#!/bin/bash
# AI Tester — Suite de regression testing para Trebol v3 Test
# Uso: ./scripts/run-tests.sh [test_id]
#   Sin argumentos: corre todos los tests
#   Con argumento: corre solo ese test (ej: ./scripts/run-tests.sh TM-03)

set -euo pipefail

# --- Configuracion ---
WEBHOOK_URL="${WEBHOOK_URL:-https://test-trebol.n8n.kairosaisolutions.com/webhook/trebol-v3-test}"
CHATWOOT_URL="https://test-trebol.chatwoot.kairosaisolutions.com"
CHATWOOT_TOKEN="${CHATWOOT_TEST_TOKEN:?Error: CHATWOOT_TEST_TOKEN no esta seteado}"
CHATWOOT_ACCOUNT_ID="${CHATWOOT_TEST_ACCOUNT_ID:-2}"
CHATWOOT_INBOX_ID="${CHATWOOT_TEST_INBOX_ID:?Error: CHATWOOT_TEST_INBOX_ID no esta seteado}"
FIXTURES_DIR="$(cd "$(dirname "$0")/../tests/fixtures" && pwd)"
RESULTS_DIR="$(cd "$(dirname "$0")/../tests" && pwd)/results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_FILE="${RESULTS_DIR}/run_${TIMESTAMP}.log"
WAIT_RESPONSE=20  # seconds to wait for bot response (AI + tools tarda 15-20s)

# Contadores
TOTAL=0
PASSED=0
FAILED=0
ERRORS=0

# Track conversation IDs for cleanup on interrupt
CLEANUP_CONV_IDS=()

mkdir -p "$RESULTS_DIR"

# --- Funciones ---

log() {
  echo "$1" | tee -a "$RESULTS_FILE"
}

cleanup_on_exit() {
  if [ ${#CLEANUP_CONV_IDS[@]} -gt 0 ]; then
    log ""
    log "--- Limpiando conversaciones de test ---"
    for cid in "${CLEANUP_CONV_IDS[@]}"; do
      cleanup_conversation "$cid" 2>/dev/null || true
    done
  fi
}

trap cleanup_on_exit EXIT

create_test_contact() {
  # Crea un contacto en Chatwoot TEST y devuelve el contact_id
  local test_id="$1"
  local identifier="$2"
  local phone="$3"

  local response
  response=$(curl -s -X POST \
    "${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts" \
    -H "api_access_token: ${CHATWOOT_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg name "Test ${test_id}" \
      --arg phone "$phone" \
      --arg identifier "$identifier" \
      '{
        name: $name,
        phone_number: $phone,
        identifier: $identifier
      }')")

  local contact_id
  contact_id=$(echo "$response" | jq -r '.id // .payload.contact.id // empty')

  if [ -z "$contact_id" ]; then
    # Si el contacto ya existe (identifier duplicado), extraer de error
    contact_id=$(echo "$response" | jq -r '.payload.contact.id // empty')
    if [ -z "$contact_id" ]; then
      log "  ERROR: No se pudo crear contacto. Response: $(echo "$response" | jq -c '.')"
      return 1
    fi
  fi

  echo "$contact_id"
}

create_test_conversation() {
  # Crea una conversacion en Chatwoot TEST y devuelve el conversation_id (numerico)
  local contact_id="$1"

  local response
  response=$(curl -s -X POST \
    "${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations" \
    -H "api_access_token: ${CHATWOOT_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --argjson contact_id "$contact_id" \
      --argjson inbox_id "$CHATWOOT_INBOX_ID" \
      '{
        contact_id: $contact_id,
        inbox_id: $inbox_id,
        custom_attributes: { bot: "on" }
      }')")

  local conv_id
  conv_id=$(echo "$response" | jq -r '.id // empty')

  if [ -z "$conv_id" ]; then
    log "  ERROR: No se pudo crear conversacion. Response: $(echo "$response" | jq -c '.')"
    return 1
  fi

  echo "$conv_id"
}

cleanup_conversation() {
  # Resuelve la conversacion en Chatwoot para no acumular basura
  local conv_id="$1"

  curl -s -X POST \
    "${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conv_id}/toggle_status" \
    -H "api_access_token: ${CHATWOOT_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"status": "resolved"}' > /dev/null
}

send_message() {
  local message="$1"
  local conv_id="$2"
  local identifier="$3"
  local phone="$4"

  local payload
  payload=$(jq -n \
    --arg msg "$message" \
    --arg identifier "$identifier" \
    --arg phone "$phone" \
    --argjson conv_id "$conv_id" \
    --argjson account_id "$CHATWOOT_ACCOUNT_ID" \
    --argjson inbox_id "$CHATWOOT_INBOX_ID" \
    '{
      event: "message_created",
      account: { id: $account_id },
      conversation: {
        id: $conv_id,
        account_id: $account_id,
        inbox_id: $inbox_id,
        custom_attributes: { bot: "on" },
        meta: { sender: { phone_number: $phone } },
        messages: [{
          content: $msg,
          message_type: 0,
          sender_type: "Contact",
          sender: { identifier: $identifier }
        }]
      },
      sender: { phone_number: $phone, identifier: $identifier },
      content: $msg,
      source_id: $identifier
    }')

  curl -s -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "$payload"
}

get_bot_responses() {
  local conv_id=$1

  local response
  response=$(curl -s "${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conv_id}/messages" \
    -H "api_access_token: ${CHATWOOT_TOKEN}")

  # Filter: message_type == 1 (outgoing = bot responses)
  echo "$response" | jq -r '[.payload[] | select(.message_type == 1) | {content: .content, attachments: (.attachments // []), created_at: .created_at}] | sort_by(.created_at)'
}

evaluate_test() {
  local test_file=$1
  local responses=$2

  local test_id
  test_id=$(jq -r '.id' "$test_file")
  local test_name
  test_name=$(jq -r '.name' "$test_file")

  local all_text
  all_text=$(echo "$responses" | jq -r '[.[].content // ""] | join(" ")')

  local result="PASS"
  local failures=""

  # must_contain: TODOS deben estar
  local mc
  mc=$(jq -r '.must_contain // [] | .[]' "$test_file")
  while IFS= read -r term; do
    [ -z "$term" ] && continue
    if ! echo "$all_text" | grep -qF "$term"; then
      result="FAIL"
      failures="${failures}\n  - must_contain FALTA: '${term}'"
    fi
  done <<< "$mc"

  # must_contain_any: al menos 1
  local mca
  mca=$(jq -r '.must_contain_any // [] | .[]' "$test_file")
  if [ -n "$mca" ]; then
    local found_any=false
    while IFS= read -r term; do
      [ -z "$term" ] && continue
      if echo "$all_text" | grep -qF "$term"; then
        found_any=true
        break
      fi
    done <<< "$mca"
    if [ "$found_any" = false ]; then
      result="FAIL"
      failures="${failures}\n  - must_contain_any NINGUNO encontrado: $(jq -c '.must_contain_any' "$test_file")"
    fi
  fi

  # must_contain_any_2: al menos 1 del segundo grupo
  local mca2
  mca2=$(jq -r '.must_contain_any_2 // [] | .[]' "$test_file")
  if [ -n "$mca2" ]; then
    local found_any2=false
    while IFS= read -r term; do
      [ -z "$term" ] && continue
      if echo "$all_text" | grep -qF "$term"; then
        found_any2=true
        break
      fi
    done <<< "$mca2"
    if [ "$found_any2" = false ]; then
      result="FAIL"
      failures="${failures}\n  - must_contain_any_2 NINGUNO encontrado: $(jq -c '.must_contain_any_2' "$test_file")"
    fi
  fi

  # must_not_contain: NINGUNO debe estar
  local mnc
  mnc=$(jq -r '.must_not_contain // [] | .[]' "$test_file")
  while IFS= read -r term; do
    [ -z "$term" ] && continue
    if echo "$all_text" | grep -qF "$term"; then
      result="FAIL"
      failures="${failures}\n  - must_not_contain PRESENTE: '${term}'"
    fi
  done <<< "$mnc"

  # must_have_photos
  local needs_photos
  needs_photos=$(jq -r '.must_have_photos // false' "$test_file")
  if [ "$needs_photos" = "true" ]; then
    local photo_count
    photo_count=$(echo "$responses" | jq '[.[].attachments | length] | add // 0')
    if [ "$photo_count" -eq 0 ]; then
      result="FAIL"
      failures="${failures}\n  - must_have_photos: 0 fotos encontradas"
    fi
  fi

  # max_messages
  local max_msg
  max_msg=$(jq -r '.max_messages // 0' "$test_file")
  if [ "$max_msg" -gt 0 ]; then
    local msg_count
    msg_count=$(echo "$responses" | jq 'length')
    if [ "$msg_count" -gt "$max_msg" ]; then
      result="FAIL"
      failures="${failures}\n  - max_messages: ${msg_count} mensajes (max: ${max_msg})"
    fi
  fi

  # order_check
  local has_order
  has_order=$(jq -r '.order_check // empty' "$test_file")
  if [ -n "$has_order" ]; then
    local first_msg
    first_msg=$(echo "$responses" | jq -r '.[0].content // ""')

    local oc_must
    oc_must=$(jq -r '.order_check.first_message_must_contain_any // [] | .[]' "$test_file")
    if [ -n "$oc_must" ]; then
      local found_oc=false
      while IFS= read -r term; do
        [ -z "$term" ] && continue
        if echo "$first_msg" | grep -qF "$term"; then
          found_oc=true
          break
        fi
      done <<< "$oc_must"
      if [ "$found_oc" = false ]; then
        result="FAIL"
        failures="${failures}\n  - order_check: primer mensaje no contiene ninguno de: $(jq -c '.order_check.first_message_must_contain_any' "$test_file")"
      fi
    fi

    local oc_not
    oc_not=$(jq -r '.order_check.first_message_must_not_contain // [] | .[]' "$test_file")
    while IFS= read -r term; do
      [ -z "$term" ] && continue
      if echo "$first_msg" | grep -qF "$term"; then
        result="FAIL"
        failures="${failures}\n  - order_check: primer mensaje contiene '${term}' (prohibido)"
      fi
    done <<< "$oc_not"
  fi

  # Output
  echo "${result}|${failures}"
}

run_single_test() {
  local test_file=$1
  local test_id
  test_id=$(jq -r '.id' "$test_file")
  local test_name
  test_name=$(jq -r '.name' "$test_file")
  local wait_seconds
  wait_seconds=$(jq -r '.wait_seconds // '"$WAIT_RESPONSE"'' "$test_file")

  TOTAL=$((TOTAL + 1))
  log ""
  log "--- ${test_id}: ${test_name} ---"

  # 1. Generar identificadores unicos para este test
  local test_identifier="test-$(date +%s)-$$-${test_id}"
  local test_phone="+549110000$(printf '%04d' $((RANDOM % 10000)))"

  log "  identifier: ${test_identifier}"
  log "  phone: ${test_phone}"

  # 2. Crear contacto en Chatwoot TEST
  local contact_id
  contact_id=$(create_test_contact "$test_id" "$test_identifier" "$test_phone")
  if [ $? -ne 0 ] || [ -z "$contact_id" ]; then
    log "  ERROR: Fallo al crear contacto en Chatwoot"
    ERRORS=$((ERRORS + 1))
    return
  fi
  log "  contact_id: ${contact_id}"

  # 3. Crear conversacion en Chatwoot TEST
  local conv_id
  conv_id=$(create_test_conversation "$contact_id")
  if [ $? -ne 0 ] || [ -z "$conv_id" ]; then
    log "  ERROR: Fallo al crear conversacion en Chatwoot"
    ERRORS=$((ERRORS + 1))
    return
  fi
  log "  conversation_id: ${conv_id} (numerico real)"

  # Track para cleanup
  CLEANUP_CONV_IDS+=("$conv_id")

  # 4. Enviar mensajes via POST directo al webhook
  local messages
  messages=$(jq -r '.messages[]' "$test_file")
  while IFS= read -r msg; do
    if [[ "$msg" == __WAIT_* ]]; then
      local wait_time="${msg#__WAIT_}"
      wait_time="${wait_time%__}"
      log "  [esperar ${wait_time}s]"
      sleep "$wait_time"
    else
      log "  -> Cliente: ${msg}"
      send_message "$msg" "$conv_id" "$test_identifier" "$test_phone"
      sleep 1
    fi
  done <<< "$messages"

  # 5. Esperar procesamiento (debounce + AI)
  log "  [esperar ${wait_seconds}s para respuesta del bot]"
  sleep "$wait_seconds"

  # 6. Leer respuestas del bot via Chatwoot API
  local responses
  responses=$(get_bot_responses "$conv_id")
  local msg_count
  msg_count=$(echo "$responses" | jq 'length')

  if [ "$msg_count" -eq 0 ]; then
    log "  ERROR: Bot no respondio (0 mensajes outgoing en conversacion ${conv_id})"
    ERRORS=$((ERRORS + 1))
    # 7. Cleanup
    cleanup_conversation "$conv_id"
    return
  fi

  # Mostrar respuestas
  local i=0
  while [ $i -lt "$msg_count" ]; do
    local content
    content=$(echo "$responses" | jq -r ".[$i].content // \"(vacio)\"")
    local att_count
    att_count=$(echo "$responses" | jq ".[$i].attachments | length")
    log "  <- Bot[$((i+1))]: ${content}"
    if [ "$att_count" -gt 0 ]; then
      log "     [${att_count} attachment(s)]"
    fi
    i=$((i + 1))
  done

  # 7. Evaluar
  local eval_result
  eval_result=$(evaluate_test "$test_file" "$responses")
  local verdict="${eval_result%%|*}"
  local details="${eval_result#*|}"

  if [ "$verdict" = "PASS" ]; then
    log "  RESULTADO: PASS"
    PASSED=$((PASSED + 1))
  else
    log "  RESULTADO: FAIL"
    log "  Razones:$(echo -e "$details")"
    FAILED=$((FAILED + 1))
  fi

  # 8. Cleanup: resolver conversacion
  cleanup_conversation "$conv_id"
  log "  [conversacion ${conv_id} resuelta]"
}

# --- Main ---

log "=========================================="
log "AI Tester — Trebol v3 Regression Suite"
log "Fecha: $(date)"
log "Webhook: ${WEBHOOK_URL}"
log "Chatwoot: ${CHATWOOT_URL} (account: ${CHATWOOT_ACCOUNT_ID}, inbox: ${CHATWOOT_INBOX_ID})"
log "Wait response: ${WAIT_RESPONSE}s"
log "=========================================="

TARGET_TEST="${1:-}"

if [ -n "$TARGET_TEST" ]; then
  # Correr un solo test
  test_file="${FIXTURES_DIR}/${TARGET_TEST,,}.json"
  if [ ! -f "$test_file" ]; then
    # Intentar con guion bajo
    test_file="${FIXTURES_DIR}/$(echo "$TARGET_TEST" | tr '[:upper:]' '[:lower:]' | tr '-' '-').json"
  fi
  if [ ! -f "$test_file" ]; then
    log "ERROR: Fixture no encontrado para ${TARGET_TEST}"
    exit 1
  fi
  run_single_test "$test_file"
else
  # Correr todos los tests en orden
  for test_file in "${FIXTURES_DIR}"/tb-*.json "${FIXTURES_DIR}"/tm-*.json; do
    [ -f "$test_file" ] || continue
    run_single_test "$test_file"
  done
fi

# Resumen
log ""
log "=========================================="
log "RESUMEN"
log "=========================================="
log "Total:   ${TOTAL}"
log "Passed:  ${PASSED}"
log "Failed:  ${FAILED}"
log "Errors:  ${ERRORS}"
log ""
if [ "$FAILED" -eq 0 ] && [ "$ERRORS" -eq 0 ]; then
  log "ALL TESTS PASSED"
else
  log "SOME TESTS FAILED — revisar detalle arriba"
fi
log "Resultados guardados en: ${RESULTS_FILE}"
```

---

## 7. Prerequisitos

### Variables de entorno necesarias

| Variable | Descripcion | Donde obtener |
|----------|-------------|---------------|
| `CHATWOOT_TEST_TOKEN` | Token API de Chatwoot TEST (crear contactos, conversaciones, leer mensajes) | Settings > Account > API Token en Chatwoot TEST |
| `CHATWOOT_TEST_ACCOUNT_ID` | Account ID de Chatwoot TEST (default: 2) | URL de Chatwoot |
| `CHATWOOT_TEST_INBOX_ID` | Inbox ID del inbox API/WhatsApp en Chatwoot TEST | Chatwoot TEST > Settings > Inboxes > copiar el ID del inbox |
| `WEBHOOK_URL` | URL del webhook de n8n TEST (opcional, tiene default) | `https://test-trebol.n8n.kairosaisolutions.com/webhook/trebol-v3-test` |

### Dependencias del script

- `bash` (ya instalado)
- `curl` (ya instalado)
- `jq` (verificar: `which jq || apt install jq`)

### Prerequisitos del sistema bajo test

1. Trebol v3 Test debe estar activo en n8n TEST
2. Chatwoot TEST debe estar corriendo
3. El webhook de Chatwoot TEST debe estar configurado para enviar al path correcto de n8n TEST (`trebol-v3-test`)
4. Verificar que el webhook UUID de Chatwoot TEST apunta al webhook path correcto de n8n (no al de prod)

### Como obtener el inbox_id

```bash
# Listar inboxes de Chatwoot TEST
curl -s "${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes" \
  -H "api_access_token: ${CHATWOOT_TEST_TOKEN}" | jq '.payload[] | {id, name, channel_type}'

# Buscar el inbox de tipo "api" o "Channel::Api" o el inbox de WhatsApp/Evolution
# El id de ese inbox es el CHATWOOT_TEST_INBOX_ID
```

### Verificacion rapida

```bash
# 1. Verificar que el webhook de n8n TEST responde
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${WEBHOOK_URL}" \
  -H "Content-Type: application/json" \
  -d '{"event":"message_created","content":"ping"}'
# Esperado: 200

# 2. Verificar que Chatwoot TEST responde
curl -s -o /dev/null -w "%{http_code}" \
  "${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations" \
  -H "api_access_token: ${CHATWOOT_TEST_TOKEN}"
# Esperado: 200

# 3. Verificar que se puede crear un contacto de prueba
curl -s -X POST \
  "${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts" \
  -H "api_access_token: ${CHATWOOT_TEST_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Ping","phone_number":"+5491100009999","identifier":"test-ping-delete-me"}' \
  | jq '{id, name}'
# Esperado: {"id": <numero>, "name": "Test Ping"}

# 4. Listar inboxes para encontrar CHATWOOT_TEST_INBOX_ID
curl -s "${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes" \
  -H "api_access_token: ${CHATWOOT_TEST_TOKEN}" | jq '.payload[] | {id, name, channel_type}'

# 5. Round-trip manual: enviar mensaje real desde WhatsApp TEST y verificar respuesta end-to-end
# Esto confirma: Evolution API -> Chatwoot -> webhook -> n8n -> respuesta -> Chatwoot -> WhatsApp
```

---

## 8. Limitaciones Conocidas

### Dependencia de stock

Los tests TB-01 a TB-06 dependen de que ciertos vehiculos esten en el inventario de MongoDB. Si el inventario cambia, los tests pueden fallar por razones ajenas al bot.

**Mitigacion:** Los criterios de evaluacion son genericos ("debe contener 'stock'" en vez de "debe contener 'Ford F100 221'"). Si un vehiculo sale de stock, el test puede necesitar actualizacion del fixture.

### Timing

El debounce de Redis (5s) + AI processing (~10-15s) + envio (~2s) significa que cada test tarda minimo 20 segundos. Los wait times estan configurados en 20s entre turnos. Una suite completa de 14 tests tarda aproximadamente 10-15 minutos.

### Evaluacion semantica

El script evalua presencia/ausencia de strings, no semantica. Un bot que diga "Lamentablemente no aceptamos lotes" pasaria TB-05 por contener "no aceptamos", pero un bot que diga "Los lotes no son un metodo de pago valido en nuestra agencia" podria fallar si no contiene ninguna de las frases esperadas.

**Mitigacion:** Las listas de `must_contain_any` incluyen multiples variantes. Se pueden agregar mas a medida que se descubren nuevas formulaciones del bot.

### Concurrencia

Los tests se corren secuencialmente (uno a la vez). Correr tests en paralelo podria causar conflictos en Redis (debounce, locks, conv_state).

### Conversaciones residuales

Cada test crea un contacto y una conversacion en Chatwoot TEST. La conversacion se resuelve automaticamente al finalizar el test (cleanup integrado). Los contactos de test quedan en Chatwoot pero no afectan el funcionamiento.

---

## 9. Integracion con el Ciclo de Desarrollo

### Flujo propuesto

```
1. Editar workflow JSON
   +-- vim/Claude edita workflows/trebol_v3_test.json

2. Deploy a test
   +-- bash scripts/deploy-workflow-test.sh trebol_v3_test.json

3. Correr tests
   +-- bash scripts/run-tests.sh
   +-- (o un test especifico: bash scripts/run-tests.sh TM-03)

4. Ver resultados
   +-- cat tests/results/run_YYYYMMDD_HHMMSS.log

5. Si FAIL -> fix -> volver a paso 1
   Si PASS -> commit + PR
```

### Cuando correr tests

| Situacion | Que correr |
|-----------|------------|
| Cambio en system prompt del AI Agent | Todos los tests (`run-tests.sh`) |
| Cambio en Parsear Respuesta | TM-04, TM-07 |
| Cambio en Clasificador Contextual | TM-02, TM-03, TM-05, TM-06 |
| Cambio en Construir Instrucciones | TB-06, TB-07, TM-01, TM-05 |
| Cambio en flujo de envio | TM-07 |
| Cambio en CRM o alertas | TB-02, TB-03, TM-01 |
| Antes de merge a prod | Todos los tests |

---

## 10. Paths sin Test Directo (MVP)

Los siguientes paths del clasificador contextual NO tienen test directo en el MVP. Se documentan para completar cobertura en iteraciones futuras:

| Path | Razon de exclusion | Prioridad futura |
|------|--------------------|------------------|
| `admin` | Requiere simular mensajes de admin (no cliente). Flujo diferente. | Media |
| `catalogo_ml_financiacion` | Requiere vehiculo en stock con opciones de financiacion activas en Sheets. Depende de estado de datos. | Alta |
| `cuotas` | Requiere que el bot haya ofrecido financiacion primero (depende de conv_state previo). | Alta |
| `financiacion` | Similar a cuotas, requiere vehiculo elegido + pregunta explicita de financiacion. | Alta |

Estos paths se verifican indirectamente en TB-06 (flujo completo hasta handoff) que incluye financiacion, pero no hay assertions especificas sobre el contenido de la simulacion de cuotas.

---

## 11. Evoluciones Futuras (NO en este plan)

Estas ideas quedan para iteraciones posteriores. Este plan solo cubre la suite de regression tests.

| Idea | Descripcion | Cuando |
|------|-------------|--------|
| Tests de paths faltantes | Agregar TB-08 a TB-11 para admin, catalogo_ml_financiacion, cuotas, financiacion | Despues de estabilizar MVP |
| LLM como evaluador | Usar GPT-4.1-mini para evaluar semanticamente las respuestas (no solo string matching) | Cuando el string matching no sea suficiente |
| CI integration | Correr tests automaticamente en cada push via GitHub Actions | Cuando haya suficientes tests estables |
| RAG conversacional | Pipeline que indexa conversaciones buenas/malas en MongoDB para RAG | Despues de que v3 este estable en prod |
| Test de performance | Medir tiempos de respuesta del bot (latencia webhook-to-response) | Cuando la latencia sea un problema |
| Test de carga | Enviar N mensajes simultaneos para verificar que el debounce y locks funcionan | Antes de subir a prod |
| Generador de fixtures | Script que convierte conversaciones de Chatwoot en fixtures de test automaticamente | Cuando haya 20+ tests |

---

## 12. Rollback

Este plan no modifica ningun sistema existente. No hay rollback necesario. Si el tester no funciona, simplemente no se usa.

Los unicos archivos que se crean son:
- `scripts/run-tests.sh` (script)
- `tests/fixtures/*.json` (datos de test)
- `tests/results/*.log` (resultados — gitignored)

Para "desinstalar": `rm -rf scripts/run-tests.sh tests/`

---

## 13. Checklist Pre-Implementacion

- [ ] Verificar que `jq` esta instalado en el VPS (`which jq`)
- [ ] Obtener token API de Chatwoot TEST (para crear contactos, conversaciones, leer mensajes)
- [ ] Obtener account_id de Chatwoot TEST (default: 2)
- [ ] Obtener inbox_id de Chatwoot TEST (`GET /api/v1/accounts/{id}/inboxes`)
- [ ] Verificar que se puede crear un contacto de prueba via API de Chatwoot TEST
- [ ] Verificar que se puede crear una conversacion de prueba via API de Chatwoot TEST
- [ ] Verificar que Trebol v3 Test esta activo en n8n TEST
- [ ] Verificar que el webhook de n8n TEST responde (POST a `$WEBHOOK_URL` devuelve 200)
- [ ] Verificar que el webhook UUID de Chatwoot TEST apunta al path correcto de n8n (`trebol-v3-test`, no al de prod)
- [ ] Setear variables de entorno: `CHATWOOT_TEST_TOKEN`, `CHATWOOT_TEST_INBOX_ID`
- [ ] Round-trip manual: enviar un POST al webhook con un conv_id real de Chatwoot, verificar que el bot responde en esa conversacion
- [ ] Crear directorio `tests/fixtures/` y `tests/results/`
- [ ] Agregar `tests/results/` a `.gitignore`
