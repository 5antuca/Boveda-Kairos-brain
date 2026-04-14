# Trebol — Workflows & Architecture

Cliente: El Trébol Automotores (Benavídez, Buenos Aires)
Infra VPS/Docker → ver `VPSarchitecture.md` | Workflow principal → ver `trebol_workflow.md`

## Inventario de Workflows

| Workflow | ID prod | Nodos | Función |
|----------|---------|-------|---------|
| **Trebol22cuotas** | `wf4ts1WKcpOaE90A__FkD` | 152 | Cerebro principal (detalle en `trebol_workflow.md`) |
| **Tool Simulador Cuotas** | `wdw-IwuR1VGR0_DAjSxGI` | 5 | Sub-workflow: cuotas 3/6/12 meses |
| **SheetsToMongo v2** | `4atsII1pbYHYtOFVYzaVa` | 19 | Sync Sheets→MongoDB con embeddings, cron 4x/día |
| **AlertasVendedores** | `4JLhwQIiYGHMYfdIRBoMO` | 8 | Dispatcher de alertas a grupo WhatsApp |
| **Error Handler** | `u9skDIVyI2OnHieM` | 7 | Handler de errores global |
| **Cleanup Chat Histories** | `RQp92tU6W7ZM9Wr5` | 3 | Limpieza historiales Postgres |

Test: **AsistenteInterno** (suite 4+1 workflows, gestión inventario via WhatsApp grupal).

## Flujo de Datos

```
WhatsApp → Evolution API → Chatwoot → Webhook → Trebol22cuotas (n8n)
  ├── Redis (debounce + lock)
  ├── Clasificador → Guardias / AI Agent (GPT-4.1-mini)
  │     ├── buscar_inventario_autos (MongoDB vector search)
  │     ├── OPCIONES DE FINANCIACION (Google Sheets)
  │     └── calcular_cuotas (sub-workflow)
  ├── Respuesta → Chatwoot → WhatsApp
  ├── Extraer Datos CRM → Google Sheets
  └── Alertas → AlertasVendedores → WhatsApp grupo

SheetsToMongo v2 (cron 4x/día):
  Google Sheets inventario → Embeddings OpenAI → MongoDB Atlas
```

---

## Tool Simulador Cuotas

**ID test**: `nq3pdz31aX-61Wt17iyv6` | **Archivo**: `tool_simulador_cuotas_test.json`

Input: `{precio_contado, anticipo}` (USD). Output: cuotas 3/6/12 meses formateadas.

Nodos: Execute Workflow Trigger → Normalizar Inputs → Dolar Blue (Bluelytics API) → Calcular Cuotas (Code)

Notas:
- `Leer TF Cuotas` (Sheets) está deshabilitado — factores hardcodeados en Code
- `Dolar Blue` no tiene `onError: continueRegularOutput` — si Bluelytics cae, falla

---

## AlertasVendedores

**ID**: `GyW7SjZluIdZyAYt_9LIO` | **Archivo**: `alertasvendedores_test.json`

Dispatcher puro: recibe POST → formatea → envía a grupo WhatsApp via Evolution API.

```
Webhook /alertas-vendedores → Get Group ID → Switch Tipo Alerta
  ├── lead_caliente → formato con tel/mensaje/url
  ├── pedido → formato con nombre/vehiculo/presupuesto
  ├── papeles → formato con tel/mensaje/url
  └── foto → formato con nombre/tel/url
→ Enviar a WhatsApp (POST Evolution API /message/sendText)
```

Horarios: Lun-Vie 8:40-18:00, Sáb 8:40-13:00. Fuera de horario → Wait hasta 8:40 del siguiente día hábil.

Env requeridas: `WHATSAPP_ALERTS_GROUP_ID`, `EVOLUTION_DOMAIN`, `EVOLUTION_INSTANCE_NAME`, `EVOLUTION_API_KEY`

---

## SheetsToMongo v2

**ID**: `4atsII1pbYHYtOFVYzaVa` | **Cron**: `0 0 8,13,17,20 * * *`

Lee 5 tabs del inventario → clasifica vs MongoDB (insert/update/delete/skip) → sync con embeddings.

| Tab | gid | TIPO |
|-----|-----|------|
| Vehiculos | 0 | Vehiculo |
| Nautico | 253929510 | Acuatico |
| Motos | 509017185 | Moto |
| Camiones | 1980478262 | Camion |
| Maquinaria | 409148329 | Maquinaria |

Lógica clave:
- `Classify & Prepare`: compara pageContent normalizado, vehiculos "señado"/"no en agencia" → DELETE
- Update = delete + reinsert con embedding fresco
- Keywords RAG por tipo inyectadas en pageContent (ej: "auto, coche, automóvil, vehículo")
- Columna ID: `item.ID || item.id || item.col_1` (tabs sin header usan col_1)
- Queries MongoDB con `$or` para cubrir docs viejos (ID raíz) y nuevos (metadata.ID)

Env: `SHEETS_INVENTARIO_DOC_ID`, `MONGO_COLLECTION`
Credentials: Google Sheets `fgnvAapxXc3HT6lR`, MongoDB `LdUrhcJ7FxBoD4fF`, OpenAI `U7Gr2AQALZbwD5qV`

---

## AsistenteInterno (solo test)

Suite de workflows para gestión de inventario via WhatsApp grupal de vendedores.

```
WhatsApp Grupo → Gateway → Orchestrator (AI) → Manager (CRUD Sheets)
                                              → Sender (respuestas WA)
                                              → Tool Buscar Inventario Sheets
```

Manager opera SOLO sobre Sheets. SheetsToMongo sincroniza a MongoDB automáticamente.

| Workflow | Función |
|----------|---------|
| Gateway | Recibe Evolution API, filtra grupo |
| Orchestrator | AI Agent: decide ADD/UPDATE/DELETE o búsqueda |
| Manager | CRUD Sheets (ADD: append, UPDATE: appendOrUpdate por ID, DELETE: clear row) |
| Sender | Envía respuestas a WhatsApp |
| Tool Buscar Inventario | Lee 4 tabs, filtra por keyword |
