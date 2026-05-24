---
tags: [fangiocrm, roadmap, next-session, saas, multitenant, billing, shopify]
fecha: 2026-05-24
estado: ABRIR AL EMPEZAR LA PRÓXIMA SESIÓN
relacionado: [[Fangio_CRM]], [[Roadmap_SaaS_MVP]], [[Trebol_Bot_Embedded]], [[Next_Session_Checklist]]
---

# Roadmap Próxima Sesión — FangioCRM SaaS MVP (post 2026-05-24)

> 📍 Roadmap detallado y vivo: **[[Roadmap_SaaS_MVP]]**. Spec técnica: `specs/2026-05-24-fangiocrm-saas-mvp.md`.

## ✅ Estado al cierre (2026-05-24)

**Pivote a SaaS alquilable multi-tenant** (50k ARS/mes vía Shopify, público no-técnico, Excel-drop auto-schema). **Backend autónomo COMPLETO**, todo en test sobre `bot-rollback-2026-04-18` (pusheado a GitHub):

- **F0** — auditoría: el scaffold ya tenía onboarding (`register`/`setup`), zero-touch Evolution por tenant, QR, loop inbound (texto/audio/imagen), persistencia.
- **F1** — bot multi-tenant: config desde `Tenant` en Mongo (fallback YAML), prompt parametrizado por tenant, stock aislado por `tenantId` (colección + `vector_index` compartidos). `a89804a`+`89eb35b`. → **cierra el backlog viejo "Multi-tenant real" + "Bot embebido por tenant"**.
- **F2.1/F2.2** — auto-schema "de fábrica": mapper LLM (`ingest/schema_mapping.py`) Excel→canónico (desambigua por valores) + wired/persistido (`tenantinventories.columnMapping`). `9e3cf0b`+`c917793`.
- **F4** — prompt caching: prompt estático estable + estado CRM como mensaje aparte → **~98% de tokens cacheados**. `e5d81d0`.
- **Fix presupuesto**: ante señal sin número, el bot pregunta presupuesto+uso en vez de inventar el monto.
- Regresión `test_bot.sh`: 25-26/27 (los 2 fails = asserts viejos de TIAGO permuta, variabilidad LLM, NO regresión).

## 🟢 EMPEZAR ACÁ (lo que queda — necesita input/config o frontend)

### 1. F3 — billing por MercadoPago Suscripciones *(pivote desde Shopify; IMPLEMENTADO+DEPLOYADO 2026-05-24)*
- ✅ **Construido + deployado** (FangioCRM `4cd29bb`): `GET /api/billing/subscribe` (preapproval 50k/mes, `external_reference=tenantId`, redirige al checkout MP) + `POST /api/webhooks/mercadopago` (activa `pro` / pausa `basic` por status). `MERCADOPAGO_ACCESS_TOKEN` en Vercel ✅ (webhook responde 200). Shopify descartado (pedía pagar plan propio + app de suscripciones + gateway MP incierto en AR).
- ✅ **Verificado** (diag 2026-05-24): token producción OK + subscribe crea preapproval + webhook lee/mapea/actualiza el tenant (probado con preapproval real). ⏳ **Falta el flip `authorized→pro`** con un pago autorizado real. ⚠️ **OJO: MP no deja que el dueño de la cuenta MP se suscriba a sí mismo** (401) → testear con un comprador de OTRA cuenta MP (2da cuenta del usuario o el primer cliente real). El `SUBSCRIPTION_PRICE_ARS=100` se usó para el test → **borrarlo en Vercel para volver a 50k**.
- 🔨 **Falta (autónomo, post-test)**: gate del bot (pausar si `subscriptionActive=false`, **eximir tenants de dogfooding** como el-trebol) + botón "Suscribirme" en el dashboard.

### 2. F2.3 — UI de onboarding *(frontend FangioCRM)*
- Mostrar las `questions` del mapper al usuario no-técnico + guardar el override en `columnMapping`.
- Flujo **registro → pago** (botón que lleva a `/api/billing/subscribe` → checkout MercadoPago).
- ✅ ~~Sumar `ubicacion`/`horario` al `Tenant` + form~~ — HECHO 2026-05-24 (FangioCRM `75f6af6`: campos en modelo + Settings UI; el bot ya los lee).

### 3. F4 metering
- Enforcement de `limiteMensajes` + dashboard de consumo por tenant + **validar costos reales con Langfuse** (confirmar que 50k cubre a ~600 conv/mes).

### 4. F5 / F6
- F5: WhatsApp self-serve hardening (probar con **celular real**, reconexión, sesión fantasma).
- F6: seguridad multi-tenant — ✅ `agent/context` asegurado (Bearer secret, `33e9708`); falta auditar aislamiento general (que cada ruta filtre por `session.tenantId`) + landing/pricing.

## ⚠️ Deuda / decisiones
- **Rama `bot-rollback-2026-04-18`**: ~25 commits adelante de `main`, 15 atrás → decidir estrategia (merge/rebase a `main`) en algún momento.
- **Trebol = tenant de dogfooding** (`el-trebol` en Mongo + `trebol.yaml`); prod de Trébol sigue apagado.
- Cache de config del bot es `lru_cache` por proceso → editar un `Tenant` requiere restart (invalidación = parte de F4).
- Untracked ajenos sin commitear en el repo (gerstner specs, scripts sheetstomongo) — no son de este laburo.

## ⏳ Verificación pendiente del trabajo previo (grilla — independiente del SaaS)
- Grid estilo Excel + columna FECHA (dd/mm/yyyy) + dropdowns dark/bordes rectos — verificar **visualmente** en `www.fangiocrm.com/dashboard`. Specs `2026-05-23-fangiocrm-grid-excel-controls.md`.

## 🔧 Comandos útiles
```bash
# Regresión del bot (debe dar ~25-26/27; T3/T4 flakys)
bash scripts/test_bot.sh all

# Reimport de un tenant (dry-run primero) — usa el columnMapping persistido
docker exec trebol-test-bot curl -s -X POST http://localhost:8000/ingest/reimport-tenant \
  -H 'Content-Type: application/json' -d '{"tenant_id":"el-trebol","dry_run":true}'

# ¿Está el secret de Shopify en Vercel? (401 = sí; 400 = no)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://www.fangiocrm.com/api/webhooks/shopify \
  -H "x-shopify-hmac-sha256: x" -d '{}'

# Rebuild + recreate del bot (los .txt/.py se hornean en la imagen)
cd environments/test/trebol && docker compose build trebol-test-bot && \
  docker compose up -d --no-deps --force-recreate trebol-test-bot
```
