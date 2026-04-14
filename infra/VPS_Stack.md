---
tags: [memoria, volcado, vps, docker, infra]
fecha_volcado: 2026-04-13
---

# VPS Kairos — Stack e infra compartida

VPS Hetzner Ubuntu 24.04, 16GB RAM, 4 CPUs. Todo dockerizado detrás de Traefik con SSL wildcard.

## Stacks separados test vs prod

**No comparten nada** salvo Traefik y el host. Tienen DBs, Redis, Chatwoot, Evolution y n8n independientes para que un experimento en test no toque jamás prod.

### Containers PROD
```
trebol-prod-n8n              (main, healthy)
trebol-prod-n8n-worker       (queue mode worker)
trebol-prod-postgres         (n8n DB + chat_histories)
trebol-prod-redis            (debounce + locks)
trebol-prod-chatwoot-web
trebol-prod-chatwoot-sidekiq
trebol-prod-evolution-api
```

### Containers TEST
```
trebol-test-n8n              (main)
trebol-test-n8n-worker
trebol-test-postgres
trebol-test-redis            (password: 551ea4589d1f62e86de01e9d2d44f9af1f7c9bd252bcf945138082e79d8267dc)
trebol-test-chatwoot-web
trebol-test-chatwoot-sidekiq
trebol-test-evolution-api
```

## Rutas Traefik (observadas)

- `test-trebol.n8n.kairosaisolutions.com` → editor n8n test
- Chatwoot prod y test por subdominios separados (ver `.env` de cada stack)

## n8n Queue Mode

Main + Worker + Redis. El Worker ejecuta los workflows; el Main maneja editor UI y webhook receivers. Si tocás un workflow, **hay que reiniciar ambos**:
```bash
docker restart trebol-test-n8n trebol-test-n8n-worker
```
El Main solo no alcanza — el Worker tiene caché en memoria de los workflows activos.

## DBs por stack

### PostgreSQL (test + prod)
- DB `n8n` → executions de n8n (table `execution_entity`, `execution_data`)
- DB `postgres` → chat histories del bot (`n8n_chat_histories`), drift events (F3), CRM extraído
- DB `chatwoot` → Chatwoot (separada)
- Credentials n8n: Postgres test credential ID = `GM66VV4J8REHVNaD`
- pgvector habilitado para memoria semántica

### Redis (TEST usa 2 instancias via credentials)
- `rPxthySmRfbUaigm` — "Redis Test Trebol" → v3 schema (legacy)
- `T2jZ1pnLV5Jfbuby` — "Redis account" → v4 schema (usar este para nodos nuevos en `trebol_v4_test.json`)

### MongoDB Atlas (compartido test + prod)
- Credential n8n: `LdUrhcJ7FxBoD4fF`
- Colección con vector search index (inventario embebido por [[Pipeline_v4|SheetsToMongo v2]])
- Env: `MONGO_COLLECTION`

## Credenciales n8n clave (IDs)

| Servicio | ID | Nombre |
|---|---|---|
| Redis v3 (legacy) | `rPxthySmRfbUaigm` | Redis Test Trebol |
| Redis v4 (usar este) | `T2jZ1pnLV5Jfbuby` | Redis account |
| Google Sheets | `fgnvAapxXc3HT6lR` | — |
| OpenAI API | `U7Gr2AQALZbwD5qV` | — |
| MongoDB | `LdUrhcJ7FxBoD4fF` | — |
| Postgres | `GM66VV4J8REHVNaD` | — |

## Env vars críticas (siempre `$env.*` en n8n, nunca hardcodear)

- `CHATWOOT_DOMAIN`, `CHATWOOT_TOKEN`, `CHATWOOT_ACCOUNT_ID`
- `EVOLUTION_DOMAIN`, `EVOLUTION_INSTANCE_NAME`, `EVOLUTION_API_KEY`
- `INTERNAL_WEBHOOK_URL` → base URL de los webhooks internos del n8n (ej. AlertasVendedores). **Nunca hardcodear la URL completa**.
- `WHATSAPP_ALERTS_GROUP_ID` (AlertasVendedores)
- `SHEETS_INVENTARIO_DOC_ID`, `MONGO_COLLECTION` (SheetsToMongo)

## Observabilidad

Loki + Promtail + Grafana + Prometheus + Uptime Kuma + AlertManager (stack separado). No entro a los detalles acá — ver [[Architecture_Index]] o [[VPS_Architecture]].

## Links relacionados

- [[Pipeline_v4]]
- [[n8n_Gotchas]]
- [[Redis_Postgres_Debug]]
