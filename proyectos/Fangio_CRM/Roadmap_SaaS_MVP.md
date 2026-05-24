---
tags: [fangiocrm, roadmap, saas, mvp, multitenant, billing, onboarding]
fecha: 2026-05-24
estado: EN CURSO — F0 auditado, F1 completa
relacionado: [[Fangio_CRM]], [[Arquitectura_SaaS_Multitenant]], [[Trebol_Bot_Embedded]], [[Roadmap_Stock_Ingestion_v1]], [[Roadmap_Proxima_Sesion]]
---

# Roadmap — FangioCRM como SaaS alquilable (MVP)

> **Spec técnica viva**: `kairos-infrastructure/specs/2026-05-24-fangiocrm-saas-mvp.md` (decisiones + fases + follow-ups en detalle).

## 🎯 Visión

Convertir FangioCRM en un **SaaS multi-tenant** que una concesionaria contrata y pone a andar **sola**, sin intervención técnica nuestra en el 90% de los casos:

1. Se registra → 2. paga la suscripción → 3. **arroja su Excel de stock** → 4. conecta su WhatsApp (QR) → 5. queda con un **bot de respuestas** que entiende su planilla.

**Público NO técnico** → cero fricción, todo self-serve.

## 💰 Modelo de negocio

- Suscripción mensual vía **MercadoPago**, **50.000 ARS/mes** por concesionaria.
- Esa cuota debe **cubrir los tokens LLM** de cada usuario (bot + onboarding).
- **Por ahora: plan único, sin límite de mensajes** (se mantiene tracking de consumo para visibilidad; el cap queda como palanca futura).
- Volumen estimado: ~**600 conversaciones/mes** por concesionaria.

## 🧩 El reto técnico central

El "autoseteo de fábrica": mapear un **Excel arbitrario y desprolijo → el schema canónico** que el bot espera (MARCA, MODELO, ANIO, KM, PRECIO_AL_CONTADO, ANTICIPO…). Cuando el mapeo automático no alcanza, un **agente de onboarding** pregunta SOLO lo ambiguo, el usuario responde en texto, y se persiste el mapeo por tenant. Meta: que el 90% quede auto-seteado solo.

## 🗺️ Roadmap por fases

| Fase | Qué | Estado |
|---|---|---|
| **F0** | Auditoría del scaffold (qué funciona vs mock) | ✅ **HECHO** (2026-05-24) |
| **F1** | Bot multi-tenant (config dinámica + prompt param + stock por tenantId) | ✅ **HECHO** (2026-05-24) |
| **F2** | Auto-schema "de fábrica" (Excel→canónico) + agente de onboarding | 🟡 **F2.1 core HECHO** (mapper LLM); falta wiring + UI |
| **F3** | Billing MercadoPago real + gating (hoy es checkout mock) | ⏳ |
| **F4** | Metering / prompt caching / validar economía con datos reales | ⏳ |
| **F5** | WhatsApp self-serve hardening (Evolution a prueba de no-técnicos) | ⏳ |
| **F6** | Seguridad multi-tenant (aislamiento) + go-to-market (landing/pricing) | ⏳ |

### ✅ F0 — Auditoría (lo que ya existe)
El scaffold estaba MÁS completo de lo asumido. Funcional y real: onboarding (`register`/`setup`), **zero-touch Evolution** (crea la instancia WhatsApp por tenant al registrarse), QR + activación con self-heal, **loop inbound completo** (texto + audio→Whisper + imagen→Vision→marker del prompt), persistencia de replies, y `agent/context` ya expone config por tenant. **Mock**: el checkout (no hay MercadoPago real).

### ✅ F1 — Bot multi-tenant (deployado a test)
- **Config**: `client_config.get_client_config` resuelve YAML primero (`trebol`), si no → `Tenant` en Mongo (`fangio_crm.tenants`). Un tenant nuevo se resuelve **sin YAML ni redeploy**.
- **Prompt**: `configs/prompts/trebol.txt` es TEMPLATE compartido; `{NOMBRE_AGENCIA}`/`{UBICACION}`/`{HORARIO}`/personalización se inyectan por tenant. `trebol` renderiza idéntico.
- **Stock**: colección compartida `propiedades-test` + filtro `tenantId` (en `find()` y `$vectorSearch`); el `vector_index` de Atlas tiene `tenantId` como filtro; el ingest taggea y acota el diff por tenant. Aislamiento verificado.
- Commits: `kairos-infrastructure@a89804a` + `@89eb35b` (branch `bot-rollback-2026-04-18`, sin pushear aún).

## 🏗️ Decisiones de arquitectura

- **WhatsApp por tenant = Evolution self-host** (instancia por `tenantId`, zero-touch). Cloud API oficial fuera del MVP.
- **Config del bot dinámica desde Mongo** (no YAML estático).
- **Aislamiento por `tenantId`** en colección + índice compartidos (no cluster ni índice por cliente → mejor para self-serve a escala).
- **Billing = MercadoPago Suscripciones** + gating (pausar bot si no paga).
- **Prompt caching obligatorio** (el system prompt ~5k tokens va en cada turno).

## 📉 Economía (a validar en F4)

50k ARS ≈ ~$33-42 USD/mes. A ~600 conv/mes, estimado **~$12-18/mes en tokens con caching** → margen positivo pero **sensible** a la duración de las charlas. "Sin límite" es riesgo de cola (un tenant de alto volumen puede borrar el margen). Validar con Langfuse real apenas haya tráfico.

## 🧨 Deuda / follow-ups abiertos

- **`Tenant` no tiene `ubicacion`/`horario`** → tenants nuevos usan fallback ("nuestra concesionaria"). Sumar ambos campos al onboarding (F2).
- **Doble representación de inventario**: `agent/context` lee del modelo `Vehicle` (legacy/n8n), el bot ingesta de `TenantInventory.gridState`. Unificar fuente de verdad.
- **Seguridad**: `agent/context` es GET público que expone config de cualquier tenant; el middleware no scopea por tenant → auditar (F6).
- **Cache de config** es `lru_cache` por proceso (editar Tenant → restart del bot; invalidación = F4).
- **Trebol está de baja** (prod apagado): sirve como tenant de dogfooding, no como cliente pago. El arranque es con CERO tenants; el cliente setea su propio nombre.

## ▶️ Próximo paso

- **F2.2** — wiring del `columnMapping` en `transform.build_prepared_data` + persistencia en `TenantInventory.columnMapping` + re-ingesta al confirmar.
- **F2.3** — UI del agente de onboarding en FangioCRM (mostrar las preguntas al usuario no-técnico, guardar respuestas; sumar `ubicacion`/`horario`).
- **F3** (MercadoPago) **está bloqueado** hasta tener credenciales/cuenta MP del usuario.

> F2.1 (mapper LLM `ingest/schema_mapping.py`) ✅ verificado el 2026-05-24 contra el-trebol real + planilla sucia ("Año Modelo"→ANIO) + planilla sin precio (genera la pregunta del agente). Commit `kairos-infrastructure@9e3cf0b`.
