# Trebol — Workflows & Architecture

Cliente: El Trébol Automotores (Benavídez, Buenos Aires)
Infra VPS/Docker → ver `VPSarchitecture.md` | Workflow principal → ver `trebol_workflow.md`

> ⚠️ **Desde 2026-04-18** el cerebro del bot dejó de ser n8n y pasó a ser el bot Python LangGraph (`trebol-prod-bot`). Ver [[Prod_Deploy]]. Los workflows n8n listados abajo para **Trebol22cuotas** quedan como referencia/rollback — hoy están `active=false`.

## Inventario de Workflows

| Workflow | ID prod | Estado | Función |
|----------|---------|--------|---------|
| **Trebol v4 (ex Trebol22cuotas)** | `wf4ts1WKcpOaE90A__FkD` | ⬛ desactivado 2026-04-18 (reemplazado por bot Python) | Cerebro principal legacy |
| **Tool Simulador Cuotas** | `wdw-IwuR1VGR0_DAjSxGI` | 🟢 activo | Sub-workflow: cuotas 3/6/12 meses (usado por el bot) |
| **SheetsToMongo v2** | `4atsII1pbYHYtOFVYzaVa` | 🟢 activo | Sync Sheets→MongoDB con embeddings, cron 4x/día |
| **AlertasVendedores** | `4JLhwQIiYGHMYfdIRBoMO` | 🟢 activo | Dispatcher alertas a grupo WhatsApp (recibe POST del bot) |
| **Error Handler** | `u9skDIVyI2OnHieM` | 🟢 activo | Handler de errores global |
| **Cleanup Chat Histories** | `RQp92tU6W7ZM9Wr5` | 🟢 activo | Limpieza historiales Postgres |

Test: **AsistenteInterno** (suite 4+1 workflows, gestión inventario via WhatsApp grupal).

## Flujo de Datos (prod 2026-04-18+)

```
WhatsApp → Evolution API (trebolfinal) → Chatwoot (account 4, inbox 5)
  ↓  (webhook message_created)
trebol-prod-bot (Python LangGraph)
  ├── Redis (debounce + RedisChatMessageHistory)
  ├── LangGraph Agent (GPT-4.1-mini)
  │     ├── Tool: buscar_inventario_autos (MongoDB vector search)
  │     ├── Tool: opciones_financiacion (Sheets)
  │     └── Tool: calcular_cuotas (Python nativo)
  ├── Respuesta → Chatwoot API (3 burbujas + N fotos)
  ├── CRM Sheets write directo (Google Sheets API, columna rango A:N)
  ├── Alertas → POST $N8N_INTERNAL_URL/webhook/alertas-vendedores → AlertasVendedores → WhatsApp grupo
  └── Observabilidad → Langfuse cloud (tags: env:prod, trebol-prod)

SheetsToMongo v2 (cron 4x/día, sin cambios):
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
