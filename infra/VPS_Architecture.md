# VPS Architecture — Kairos Infrastructure

Documentado: 2026-03-03. Fuente: inspección directa del VPS.

## Hardware & OS

| Campo | Valor |
|-------|-------|
| OS | Ubuntu 24.04.3 LTS |
| Kernel | 6.8.0-100-generic |
| CPUs | 4 |
| RAM | 16 GB |
| Swap | 2 GB |
| Disco | 150 GB (28 GB usados, 19%) |
| Storage externo | Cloudflare R2 via rclone FUSE mount en `/mnt/r2-kairos` |

## Estructura de directorios

```
/opt/kairos/
├── environments/
│   ├── production/
│   │   ├── shared/
│   │   │   ├── traefik/
│   │   │   │   └── docker-compose.yml          ← Reverse proxy global
│   │   │   └── monitoring/
│   │   │       ├── prometheus/
│   │   │       │   └── docker-compose.yml      ← Prometheus + AlertManager + exporters + Telegram bot
│   │   │       ├── loki/
│   │   │       │   └── docker-compose.yml      ← Loki + Promtail + Grafana
│   │   │       └── uptime-kuma/
│   │   │           └── docker-compose.yml      ← Uptime Kuma
│   │   └── trebol/
│   │       ├── docker-compose.yml              ← Stack completo del cliente Trebol (prod)
│   │       └── .env                            ← Variables de entorno prod
│   └── test/
│       └── trebol/
│           ├── docker-compose.yml              ← Stack completo del cliente Trebol (test)
│           └── .env                            ← Variables de entorno test
├── infrastructure/
│   └── traefik/letsencrypt/acme.json           ← Certificados SSL
├── scripts/                                     ← Scripts de operación
├── backups/                                     ← Backups locales
├── cron.d/                                      ← Cron jobs
└── logs/                                        ← Logs de cron y scripts
```

## R2 Cloud Storage (rclone FUSE)

Montado en `/mnt/r2-kairos` (bucket: `kairos-storage`).

```
/mnt/r2-kairos/
├── backups/                    ← Destino de backups diarios
├── evolution-api/              ← Almacenamiento de Evolution API
├── trebol/                     ← Data de test (n8n + chatwoot)
│   ├── n8n/                    ← n8n test data (montado en trebol-test-n8n)
│   └── chatwoot/               ← Chatwoot test storage
└── trebol-prod/                ← Data de prod
    ├── n8n/                    ← n8n prod data (montado en trebol-prod-n8n)
    └── chatwoot/               ← Chatwoot prod storage
```

## Docker Networks

| Network | Tipo | Uso |
|---------|------|-----|
| `traefik_public` | bridge (IP fija: 172.18.0.100) | Red pública para todos los servicios expuestos via Traefik |
| `trebol-prod-net` | bridge | Red interna del stack de producción Trebol |
| `trebol-test-network` | bridge | Red interna del stack de test Trebol |
| `prometheus-net` | bridge | Red interna del stack de monitoring |
| `loki-net` | bridge | Red interna de Loki/Promtail/Grafana |

## Containers — Inventario completo (27 containers)

### Stack Trebol Prod (10 containers)

| Container | Imagen | Red | Función |
|-----------|--------|-----|---------|
| `trebol-prod-postgres` | `postgres:15-alpine` | prod-net | PostgreSQL — DBs: postgres, n8n, chatwoot, evolution |
| `trebol-prod-pgbouncer` | `edoburu/pgbouncer:latest` | prod-net | Connection pooling para Chatwoot (pool_size=25, max_conn=200) |
| `trebol-prod-redis` | `redis:7-alpine` | prod-net | Cache/Queue — maxmemory 512mb, volatile-lru |
| `trebol-prod-n8n` | `n8nio/n8n:2.2.4` | prod-net + traefik | n8n Main — Queue Mode, recibe webhooks |
| `trebol-prod-n8n-worker` | `n8nio/n8n:2.2.4` | prod-net + traefik | n8n Worker — concurrency=5, memory limit 2G, cpus 1.5 |
| `trebol-prod-chatwoot-web` | `chatwoot/chatwoot:v3.13.0` | prod-net + traefik | Chatwoot web server (via PgBouncer) |
| `trebol-prod-chatwoot-sidekiq` | `chatwoot/chatwoot:v3.13.0` | prod-net + traefik | Chatwoot background jobs |
| `trebol-prod-evolution-api` | `evoapicloud/evolution-api:v2.3.7` | prod-net + traefik | WhatsApp gateway — rate limit 10/s burst 50 |

### Stack Trebol Test (7 containers)

| Container | Imagen | Red | Función |
|-----------|--------|-----|---------|
| `trebol-test-postgres` | `pgvector/pgvector:pg15` | test-net | PostgreSQL con pgvector (extensión vectorial) |
| `trebol-test-redis` | `redis:7-alpine` | test-net | Cache/Queue — sin maxmemory (default) |
| `trebol-test-n8n` | `n8nio/n8n:2.2.4` | test-net + traefik | n8n Main test |
| `trebol-test-n8n-worker` | `n8nio/n8n:2.2.4` | test-net + traefik | n8n Worker test (memory 2G, cpus 1.5) |
| `trebol-test-chatwoot-web` | `chatwoot/chatwoot:v3.13.0` | test-net + traefik | Chatwoot web test |
| `trebol-test-chatwoot-sidekiq` | `chatwoot/chatwoot:v3.13.0` | test-net + traefik | Chatwoot sidekiq test |
| `trebol-test-evolution-api` | `evoapicloud/evolution-api:v2.3.7` | test-net + traefik | Evolution API test |

### Infraestructura compartida (10 containers)

| Container | Imagen | Red | Función |
|-----------|--------|-----|---------|
| `traefik` | `traefik:v2.11` | traefik_public (IP 172.18.0.100) | Reverse proxy + SSL automático (Let's Encrypt) |
| `prometheus` | `prom/prometheus:v2.49.1` | prometheus-net + traefik + prod-net | Métricas — scrape 60s, retención 7d/1GB |
| `alertmanager` | `prom/alertmanager:v0.27.0` | prometheus-net | Alertas → Telegram + Email |
| `node-exporter` | `prom/node-exporter:v1.7.0` | prometheus-net | Métricas del host (CPU, RAM, disco) |
| `cadvisor` | `gcr.io/cadvisor/cadvisor:v0.49.1` | prometheus-net | Métricas de containers |
| `postgres-exporter` | `prometheuscommunity/postgres-exporter:v0.15.0` | prometheus-net + prod-net | Métricas de PostgreSQL |
| `redis-exporter` | `oliver006/redis_exporter:v1.57.0` | prometheus-net + prod-net | Métricas de Redis |
| `telegram-bot` | custom build | prometheus-net | Bot de alertas a Telegram |
| `grafana` | `grafana/grafana:10.3.1` | loki-net + traefik | Dashboards de métricas y logs |
| `loki` | `grafana/loki:2.9.4` | loki-net | Agregador de logs |
| `promtail` | `grafana/promtail:2.9.4` | loki-net | Collector de logs → Loki |
| `uptime-kuma` | `louislam/uptime-kuma:1` | traefik_public | Monitor de uptime de servicios |

## Dominios y routing (Traefik)

| Dominio | Container destino | Puerto |
|---------|-------------------|--------|
| `trebol.n8n.kairosaisolutions.com` | trebol-prod-n8n | 5678 |
| `trebol.chatwoot.kairosaisolutions.com` | trebol-prod-chatwoot-web | 3000 |
| `trebol.evo.kairosaisolutions.com` | trebol-prod-evolution-api | 8080 |
| `test-trebol.n8n.kairosaisolutions.com` | trebol-test-n8n | 5678 |
| `test-trebol.chatwoot.kairosaisolutions.com` | trebol-test-chatwoot-web | 3000 |
| `test-trebol.evo.kairosaisolutions.com` | trebol-test-evolution-api | 8080 |
| `metrics.kairosaisolutions.com` | prometheus | 9090 |
| `traefik.kairosaisolutions.com` | traefik dashboard | 8080 |

Todos con SSL automático via Let's Encrypt (HTTP challenge). Redirect HTTP→HTTPS forzado.

**extra_hosts**: Todos los containers de cliente resuelven los dominios `*.kairosaisolutions.com` a `172.18.0.100` (IP fija de Traefik). Esto permite comunicación inter-container sin salir a internet.

## PostgreSQL — Bases de datos

### Prod (`trebol-prod-postgres`, postgres:15-alpine)

| DB | Usado por |
|----|-----------|
| `postgres` | Sistema + dblink cross-database |
| `n8n` | n8n workflows, credenciales, ejecuciones, chat_histories |
| `chatwoot` | Chatwoot CRM (conversaciones, contactos, etc.) |
| `evolution` | Evolution API (sesión WhatsApp, mensajes) |

**Extensión `dblink`**: Instalada en `postgres`. Usada por n8n para hacer UPDATE cross-database a `chatwoot` (Set Bot Off).

**Pruning**: `EXECUTIONS_DATA_PRUNE=true`, `EXECUTIONS_DATA_MAX_AGE=168` (7 días) en prod. VACUUM FULL ejecutado manualmente 2026-02-25 (14 GB → 29 MB).

### Test (`trebol-test-postgres`, pgvector/pgvector:pg15)

Misma estructura de DBs. Imagen con pgvector habilitado de base.

## Redis — Configuración

### Prod (`trebol-prod-redis`)
- `maxmemory`: 512mb
- `maxmemory-policy`: `volatile-lru` (solo evicta keys con TTL, protege jobs Bull y locks)
- Password: vía `${REDIS_PASSWORD}`
- Prefijo Evolution: `trebol_evolution` (db 0), cache en db 1

### Test (`trebol-test-redis`)
- Sin `maxmemory` configurado (default)
- Password: vía `${REDIS_PASSWORD}`

## n8n — Queue Mode

Ambos entornos corren en Queue Mode (Main + Worker + Redis):

| Config | Prod | Test |
|--------|------|------|
| Imagen | n8n:2.2.4 | n8n:2.2.4 |
| `EXECUTIONS_MODE` | queue | queue |
| `QUEUE_BULL_REDIS_CONCURRENCY` | 5 (worker) | default |
| Worker memory limit | 2G | 2G |
| Worker CPU limit | 1.5 | 1.5 |
| `OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS` | true | true |
| `EXECUTIONS_DATA_PRUNE` | true | true |
| `EXECUTIONS_DATA_MAX_AGE` | 168 (7d) | 168 (7d) |
| Timezone | America/Argentina/Buenos_Aires | America/Argentina/Buenos_Aires |
| `NODE_TLS_REJECT_UNAUTHORIZED` | 0 | 0 |
| n8n data volume | `/mnt/r2-kairos/trebol-prod/n8n` | `/mnt/r2-kairos/trebol/n8n` |

## Variables de entorno — .env

### Prod (`environments/production/trebol/.env`)

| Variable | Descripción | Sensible |
|----------|-------------|----------|
| `POSTGRES_PASSWORD` | Password PostgreSQL | SI |
| `REDIS_PASSWORD` | Password Redis | SI |
| `N8N_ENCRYPTION_KEY` | Clave de encriptación n8n | SI |
| `N8N_DOMAIN` | `trebol.n8n.kairosaisolutions.com` | NO |
| `CHATWOOT_DOMAIN` | `trebol.chatwoot.kairosaisolutions.com` | NO |
| `EVOLUTION_DOMAIN` | `trebol.evo.kairosaisolutions.com` | NO |
| `CHATWOOT_TOKEN` | API token Chatwoot | SI |
| `CHATWOOT_ACCOUNT_ID` | `4` | NO |
| `CHATWOOT_INBOX_NAME` | `trebolllllllll` | NO |
| `CHATWOOT_SECRET_KEY` | Secret key Chatwoot | SI |
| `EVOLUTION_API_KEY` | API key Evolution | SI |
| `EVOLUTION_INSTANCE_NAME` | `trebolfinal` | NO |
| `INTERNAL_WEBHOOK_URL` | `http://trebol-prod-n8n:5678` | NO |
| `N8N_INTERNAL_URL` | `http://trebol-prod-n8n:5678` | NO |
| `N8N_ENV_VARS_ENABLED` | Whitelist de vars accesibles desde n8n | NO |
| `SMTP_ADDRESS` | `smtp.gmail.com` | NO |
| `SMTP_USERNAME` | Email de envío | NO |
| `SMTP_PASSWORD` | App password Gmail | SI |
| `SHEETS_CRM_DOC_ID` | ID del Google Sheet CRM prod | NO |
| `SHEETS_INVENTARIO_DOC_ID` | ID del Google Sheet inventario prod | NO |
| `MONGO_COLLECTION` | `propiedades` | NO |

### Test (`environments/test/trebol/.env`)

Mismas variables con valores de test. Diferencias clave:

| Variable | Prod | Test |
|----------|------|------|
| `N8N_DOMAIN` | `trebol.n8n.kairosaisolutions.com` | `test-trebol.n8n.kairosaisolutions.com` |
| `CHATWOOT_ACCOUNT_ID` | `4` | `2` |
| `EVOLUTION_INSTANCE_NAME` | `trebolfinal` | `eltrebollll` |
| `SHEETS_CRM_DOC_ID` | `1No6Vzc...` | `11UPoPN...` |
| `SHEETS_INVENTARIO_DOC_ID` | `1QBxyYP...` | `12INtKC...` |
| `MONGO_COLLECTION` | `propiedades` | `propiedades-test` |
| `WHATSAPP_ALERTS_GROUP_ID` | `120363404968281666@g.us` (en compose) | `120363405756745831@g.us` |

**NOTA IMPORTANTE**: En prod, `WHATSAPP_ALERTS_GROUP_ID` está hardcodeado en el `docker-compose.yml` del n8n main y worker (valor: `120363404968281666@g.us`), NO viene del `.env`. En test sí viene del `.env`.

**`N8N_ENV_VARS_ENABLED` en prod** falta `SHEETS_CRM_DOC_ID`, `SHEETS_INVENTARIO_DOC_ID` y `MONGO_COLLECTION` en la whitelist (están en compose pero no en la whitelist del .env). En test sí están.

## Cron Jobs

Archivo: `/opt/kairos/cron.d/trebol-backups`

| Hora | Script | Función |
|------|--------|---------|
| 03:00 | `backup-postgres.sh` | Backup de PostgreSQL → R2 |
| 04:00 | `backup-evolution.sh` | Backup de Evolution API → R2 |
| 03:00 | `cleanup-chatwoot-conversations.sh 30` | Elimina conversaciones Chatwoot >30 días (account 4) |
| 05:00 dom | `cleanup-r2-backups.sh` | Limpieza de backups antiguos en R2 |
| 06:00 | `validate-backups.sh` | Validación de integridad de backups |

Logs en `/opt/kairos/logs/`.

Destino backups: `r2:kairos-backups/backups/daily/YYYYMMDD_HHMMSS/`

## Scripts disponibles

| Script | Función |
|--------|---------|
| `backup-daily.sh` | Backup completo (postgres + envs + volumes) |
| `backup-postgres.sh` | Backup de DBs PostgreSQL |
| `backup-evolution.sh` | Backup de Evolution API (prod) |
| `backup-evolution-test.sh` | Backup de Evolution API (test) |
| `cleanup-r2-backups.sh` | Limpieza de backups antiguos en R2 |
| `validate-backups.sh` | Validación de backups |
| `cleanup-chatwoot-conversations.sh` | Elimina conversaciones Chatwoot PROD con last_activity > N días (Rails runner) |
| `daily-snapshot.sh` | Snapshot diario |
| `health-check-advanced.sh` | Health check avanzado: containers, RAM, disco, backup, response time, WhatsApp zombie + degradado |
| `monitor-alerts.sh` | Monitor de alertas |
| `new-client.sh` | Onboarding de nuevo cliente |
| `decrypt-credentials.sh` | Descifra CONFIDENTIAL_CREDENTIALS.txt.gpg |
| `encrypt-credentials.sh` | Cifra credenciales |

## Monitoring Stack

```
Prometheus (scrape 60s, retención 7d/1GB)
  ├── node-exporter → métricas host (CPU, RAM, disco)
  ├── cadvisor → métricas containers
  ├── postgres-exporter → métricas PostgreSQL prod
  └── redis-exporter → métricas Redis prod
  ↓
AlertManager → telegram-bot → Telegram
  ↓
Grafana (dashboards)

Loki ← Promtail (logs de todos los containers)
  ↓
Grafana (logs viewer)

Uptime Kuma (HTTP checks de endpoints públicos)
```

## RAM — Estado actual y capacidad (medido 2026-03-19)

### Uso por container

| Container | RAM real | Límite configurado | % del límite |
|-----------|----------|-------------------|-------------|
| trebol-prod-chatwoot-sidekiq | **1.33 GB** | ninguno | — |
| trebol-test-n8n | 541 MB | ninguno | — |
| trebol-test-n8n-worker | 435 MB | 2 GB | 21% |
| trebol-prod-n8n-worker | 391 MB | 2 GB | 19% |
| trebol-prod-chatwoot-web | 313 MB | ninguno | — |
| trebol-prod-n8n | 350 MB | ninguno | — |
| trebol-prod-postgres | 328 MB | ninguno | — |
| trebol-test-chatwoot-web | 379 MB | 2 GB | 19% |
| trebol-test-chatwoot-sidekiq | 395 MB | 2 GB | 19% |
| trebol-test-postgres | 247 MB | 2 GB | 12% |
| trebol-prod-evolution-api | 244 MB | ninguno | — |
| trebol-test-evolution-api | 192 MB | 2 GB | 9% |
| prometheus | 343 MB | 512 MB | 67% |
| promtail | 111 MB | **128 MB** | **87%** ⚠ |
| loki | 132 MB | 256 MB | 51% |
| grafana | 99 MB | 256 MB | 39% |
| cadvisor | 121 MB | 512 MB | 24% |
| alertmanager | 32 MB | 64 MB | 50% |
| uptime-kuma | 153 MB | ninguno | — |
| traefik | 78 MB | ninguno | — |
| otros exporters + bot | ~66 MB | varios | — |

**Total host:** 16 GB RAM · ~6.5 GB usado · ~8.7 GB disponible · 2 GB swap

### Por qué Sidekiq usa 1.33 GB en prod

Chatwoot Sidekiq es un proceso Ruby on Rails. El problema es estructural:
1. Sin `SIDEKIQ_CONCURRENCY` configurado → default 25 threads activos
2. Cada thread tiene su propio heap Ruby + connection pool
3. El proceso crece con el tiempo a medida que procesa jobs (Ruby no devuelve memoria al SO fácilmente)
4. Test usa solo ~395 MB porque tiene menos histórico

**Los workflows n8n no son la causa** — usan RAM proporcionalmente a la complejidad del nodo Code y al número de ejecuciones simultáneas (max 5).

### Costo de RAM por cliente nuevo (estimado)

| Servicio | RAM estimada |
|----------|-------------|
| n8n main | ~350 MB |
| n8n worker | ~400 MB |
| PostgreSQL | ~300 MB |
| Redis | ~10 MB |
| Evolution API | ~200 MB |
| Chatwoot web | ~320 MB |
| Chatwoot sidekiq (sin optimizar) | ~400-1.300 MB |
| **Total por cliente nuevo** | **~2.0 - 2.9 GB** |

### Capacidad actual

- **Clientes prod actuales:** 1 (Trebol) + 1 ambiente test
- **Clientes prod adicionales posibles:** 3-4 con stack actual · 4-5 si se aplican optimizaciones
- **Cuello de botella:** RAM (no CPU — CPU promedio < 5% total)

### Optimizaciones pendientes

| Acción | Ahorro estimado | Prioridad | Riesgo |
|--------|----------------|-----------|--------|
| `SIDEKIQ_CONCURRENCY=5` en prod Chatwoot | 600-800 MB | Alta | Bajo — bajo volumen de jobs |
| `SIDEKIQ_CONCURRENCY=5` en test Chatwoot | ya OK (395 MB) | Media | Bajo |
| Memory limit en n8n main prod (1.5 GB) | protección OOM | Media | Bajo |
| `maxmemory 256mb` en test Redis | protección OOM | Media | Bajo |
| Bajar worker memory limit a 1.5 GB (usa ~400 MB) | libera headroom | Baja | Bajo |
| Aumentar límite promtail a 256 MB | evita OOM kill | Alta ⚠ | Bajo |

## Notas operativas

- **`docker restart` NO recarga `.env`**: Siempre usar `docker stop + rm + up -d` para cambios de env.
- **Todos los containers** tienen logging `json-file` con `max-size: 10m` y `max-file: 3-5`.
- **Traefik IP fija**: `172.18.0.100` en la red `traefik_public`. Todos los `extra_hosts` apuntan ahí.
- **PgBouncer**: Solo en prod, solo para Chatwoot (transaction pooling, 25 pool, 200 max).
- **Chatwoot WebSocket**: Middleware custom de headers (`X-Forwarded-Proto: https`) para que `FORCE_SSL` no bloquee `/cable`.
- **Evolution rate limit**: 10 req/s average, burst 50 (via Traefik middleware `rate-limit-evolution`). Solo en prod.
- **Sidekiq sin límite de memoria**: `trebol-prod-chatwoot-sidekiq` no tiene memory limit en Docker Compose ni `SIDEKIQ_CONCURRENCY` configurado → crece libremente. Aplicar optimización antes de agregar un segundo cliente.
