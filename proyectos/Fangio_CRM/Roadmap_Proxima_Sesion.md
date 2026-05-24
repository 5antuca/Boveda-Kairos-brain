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
- ✅ **Prueba gratis 7 días (sin MP) + gate del bot HECHOS** (FangioCRM `22e6724`): `register` arranca la prueba (`trialEndsAt = +7d`); el bot responde si paga / está en prueba / es exento (sin `trialEndsAt`, como el-trebol); pausa si la prueba venció sin suscripción. ⏳ Falta: **botón "Suscribirme"** en el dashboard (hoy se dispara visitando `/api/billing/subscribe`).

### 2. F2.3 — Wizard de onboarding post-registro *(idea del usuario 2026-05-24; el diferenciador UX)*
Modal multi-paso que se abre al registrarse y deja TODO configurado con preguntas simples. **El backend de cada paso YA EXISTE** → es básicamente frontend que orquesta APIs existentes:
1. **¿Cómo se llama tu concesionaria?** → `Tenant.nombre` (register ya lo toma / settings lo edita). ✅ backend.
2. **Arrastrá tu Excel** (campos obligatorios: marca, modelo, detalles, precio contado…) → import XLSX + **auto-schema mapper** (F2.1/2.2, `ingest/schema_mapping`) mapea columnas arbitrarias → canónico; si falta/ambiguo un obligatorio → **agente de onboarding** pregunta (las `questions` del mapper) y se guarda en `columnMapping`. ✅ backend; falta paso UI + validación de obligatorios.
3. **¿Qué financiación tenés?** → `Tenant.detallesFinanciacion`/`tasaFinanciacion` (settings). ✅ backend.
4. **Redes sociales** (omitible) → `Tenant.instagramUrl`/`facebookUrl` (settings). ✅ backend.
5. **Escaneá el QR de WhatsApp Business** → `whatsapp/status` (POST=QR) + `whatsapp/activate` (gate al conectar). ✅ backend (zero-touch Evolution).
→ **✅ HECHO 2026-05-24** (FangioCRM `20a2e56`+`bf33db4`, bot `f330092`): wizard de 4 pasos (sin la pregunta del nombre) con **agente de schema en el paso 1**. Tras subir el Excel, el wizard llama a `POST /api/inventory/analyze` (proxy a `POST /ingest/propose-mapping` del bot): mapea columnas→canónico y **solo pregunta** por los requeridos ambiguos (MARCA/MODELO/PRECIO) con dropdown de columnas; el mapping final (auto+respuestas) se persiste en `TenantInventory.columnMapping` y recién ahí se embebe (`reimport:false` difiere el reembed). Si el agente falla/no hay dudas, no bloquea (fallback: el reembed auto-mapea). Financiación = 1 textarea omitible (el texto libre lo lee el bot en su prompt, incluido "se habla con administración"). QR endurecido (route solo base64; sin imagen → `NO_QR`; botón Reintentar). **Verificado**: el-trebol mapea 67 autos sin preguntar; planilla con precio "sobre consulta" → 1 pregunta `options=["Valor"]`. Hace realidad el *"tirá el Excel y funciona"*. Para probar fresco sin pisar el-trebol (inventario real compartido con el bot test): registrar un tenant throwaway. **También 2026-05-24**: fix crash dashboard (recharts con data vacía/ceros, `a2fbf31`) + `error.tsx` temporal removido.
- ✅ Sumar `ubicacion`/`horario` al Tenant + Settings — HECHO (FangioCRM `75f6af6`). ✅ Botón "Suscribirme" + banner de prueba — HECHO (`1861057`).

### 3. F4 metering
- Enforcement de `limiteMensajes` + dashboard de consumo por tenant + **validar costos reales con Langfuse** (confirmar que 50k cubre a ~600 conv/mes).

### 4. F5 / F6
- F5: WhatsApp self-serve hardening (probar con **celular real**, reconexión, sesión fantasma).
- F6: seguridad multi-tenant — ✅ `agent/context` asegurado (Bearer secret, `33e9708`); falta auditar aislamiento general (que cada ruta filtre por `session.tenantId`) + landing/pricing.

### 5. Rebrand FangioCRM → FangioBot (dominio + UI) — DIFERIDO *(pedido 2026-05-24, "lo hago después")*
Decisión del usuario: **dominio + rebrand de UI completo**. `fangiobot.com` es un dominio **NUEVO** (no se renombra el viejo: se compra y se apunta la app). Falta comprarlo.

**Parte del usuario (dashboards — Claude no tiene acceso):**
1. **Comprar `fangiobot.com`** (registrador o Vercel Domains). TLD: `.com` recomendado; `.ai` si se busca look "AI".
2. Vercel → proyecto FangioCRM → **Settings → Domains → Add** `fangiobot.com` + `www.fangiobot.com`.
3. **DNS**: cargar los records que da Vercel (automático si se compra en Vercel).
4. Vercel → **Environment Variables**: `NEXTAUTH_URL=https://www.fangiobot.com` (⚠️ si no matchea el dominio, **el login se rompe**) + `APP_URL=https://www.fangiobot.com`.
5. **MercadoPago**: actualizar back_url/notification_url que apunten a fangiocrm.com.
6. Decidir: ¿`fangiocrm.com` se redirige a fangiobot o se deja morir?

**Parte de código (Claude, ~10 min — NO empezado, cero cambios aplicados):**
- Reemplazar marca visible "FangioCRM" → "FangioBot":
  - `src/app/layout.tsx:9` (title de la pestaña)
  - `src/app/page.tsx:34` (logo) y `:233` (footer ©)
  - `src/app/login/page.tsx:62` (h1) · `src/app/register/page.tsx:75` (h1)
  - `src/app/api/billing/subscribe/route.ts:39` (reason del preapproval MP)
- Parametrizar dominio: `subscribe/route.ts:16` `const APP_URL = "https://www.fangiocrm.com"` → `process.env.APP_URL || "https://www.fangiocrm.com"`.
- **NO** tocar el env var `FANGIOCRM_BOT_SHARED_SECRET` (nombre interno de secret; renombrarlo rompe bot + Vercel). Los comentarios con "fangiocrm" se pueden dejar.

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
