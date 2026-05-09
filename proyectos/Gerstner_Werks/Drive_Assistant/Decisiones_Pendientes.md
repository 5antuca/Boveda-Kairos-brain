---
tags: [gerstner-werks, drive-assistant, decisiones, abierto]
fecha: 2026-05-09
relacionado: [[Drive_Assistant]], [[Spec_Original]]
---

# Decisiones Pendientes — Drive Assistant

Resolver estas antes (o durante) Fase 1. Las que ya están resueltas están en
[[Drive_Assistant#✅ Decisiones tomadas]].

---

## D-Auth — Auth de la app

**Pregunta**: ¿cómo controlar quién puede usar el bot? El requerimiento es "no público,
solo gente con link autorizado".

| Opción | Descripción | Pros | Contras |
|---|---|---|---|
| **A — Token compartido en URL** | URL única tipo `https://gerstnerwerks.ai/?t=k7sJ3...`. Frontend lo guarda en localStorage y manda en header. Backend valida string-equal contra env var. | Fácil de implementar, "magic link" style. | Si alguien comparte la URL por error, hay que rotar el token (deslogueando a todos). Sin trazabilidad de quién hizo qué. |
| **B — Tokens por persona** | Cada miembro del equipo tiene su token único (`?t=santi-xyz`, `?t=juan-abc`). Mongo `users` con tokens válidos + revoke individual. | Trazabilidad. Revocás a uno sin afectar al resto. | Más código, pequeña UI de admin para crear/revocar tokens. |
| **C — Basic Auth en Traefik** | Middleware `basicAuth` de Traefik con htpasswd. Browser muestra dialog nativo. | Cero código en backend. Robusto. | UX feo (popup nativo). No funciona bien en mobile. |
| **D — Google Workspace login** | OAuth contra dominio del taller. Solo emails @gerstnerwerks.com pasan. | Auth correcta y prolija. Usa cuentas que ya tienen. | Requiere que el taller tenga Google Workspace. Más implementación. |

**Recomendación inicial**: **B** — tokens por persona. El extra es chico (1 collection Mongo + 2 endpoints admin) y te da revoke granular sin rotar a todos. **A** está OK para v1 si querés acelerar.

**Estado**: ⏳ pendiente decisión usuario.

---

## D-LLM-Model — Modelo OpenAI específico

**Pregunta**: ¿qué modelo concreto usar?

| Opción | Costo aprox por query | Calidad | Latencia |
|---|---|---|---|
| **gpt-4o-mini** | ~$0.0001 | Muy buena para clasificación + selección | ~400-600ms |
| **gpt-4.1-mini** | ~$0.0002 | Mejor reasoning, lo usás en Trebol | ~500-800ms |

**Recomendación**: **gpt-4.1-mini** por consistencia con Trebol bot (mismo provider, ya tunado, ya conocés sus quirks). El 2x de costo es despreciable a estos volúmenes (taller, no cliente final).

**Estado**: ⏳ pendiente confirmación usuario.

---

## D-Mongo — Mongo Atlas vs container local

**Pregunta**: ¿dónde corre la DB?

| Opción | Pros | Contras |
|---|---|---|
| **A — Container local** (mongo:7) | Aislamiento total entre clientes. Zero cost extra. Latencia mínima (mismo host). | Backups manuales. Si se rompe el VPS, perdés cache + folder_tree (no es crítico, regenerable). |
| **B — Atlas cluster nuevo** | Backups automáticos. UI de Atlas para inspección. | Costo (M0 free tiene 512MB, suficiente; M2 paga). Latencia VPS↔Atlas (~30-50ms). |
| **C — Reusar cluster `fangiocrm` con DB nueva** | Cero costo extra, cero infra extra. | Mezcla data de clientes (Gerstner en cluster de Fangio). Mal precedente. |

**Recomendación**: **A — container local**. Folder tree y cache son data efímera/regenerable, no necesita backups. Mongo en Docker arranca en 5s.

**Estado**: ⏳ pendiente confirmación usuario.

---

## D-DNS — Proveedor del dominio

**Pregunta**: ¿dónde registrar `gerstnerwerks.ai`?

| Opción | Costo aprox `.ai` | Pros |
|---|---|---|
| **Cloudflare Registrar** | ~$80 USD/año | Sin upsell, DNS bueno, opcional proxy + WAF gratis. |
| **Namecheap** | ~$70-90 USD/año | UI familiar. |
| **Porkbun** | ~$60-80 USD/año | Más barato, registrar especializado. |

**Recomendación**: **Cloudflare Registrar** — además del registro tenés WAF, rate limiting y bot protection gratis. Para una herramienta interna con auth por token, esa capa extra de bloqueo de bots es muy útil.

**Estado**: ⏳ pendiente decisión usuario.

---

## D-VPS — Dónde deployear

**Pregunta**: ¿este VPS o uno nuevo?

| Opción | Pros | Contras |
|---|---|---|
| **A — Este VPS** | Ya tiene Traefik, Docker, networking. Cero infra nueva. 16GB RAM con holgura (~6GB libres). | Mezcla cliente Trebol/Fangio con Gerstner. Si crece carga, hay competencia por CPU. |
| **B — VPS nuevo** | Aislamiento. Si Gerstner crece, no afecta a Trebol. | Costo extra ($10-20/mes). Más infra a mantener. |

**Recomendación**: **A — este VPS** para v1. La carga del Drive Assistant es baja (queries puntuales, no streaming continuo). Si crece, migrar es 1 día.

**Estado**: ⏳ pendiente confirmación usuario.

---

## D-Repo — Estructura del repositorio

**Pregunta**: ¿repo nuevo separado, o submódulo dentro de `gerstnerwerks5`/`kairos-infrastructure`?

| Opción | Pros | Contras |
|---|---|---|
| **A — Repo nuevo** `gerstnerwerks-drive-assistant` | Limpio, deploy independiente, git history propio. | Otro repo más a mantener. |
| **B — Subfolder de `kairos-infrastructure`** | Todo en un lugar, deploy junto con resto. | Mezcla código de cliente con infra propia. |

**Recomendación**: **A — repo nuevo, privado**. Es código de cliente, no de infra Kairos. Visibilidad privada hasta que se decida abrirlo (probablemente nunca).

**Estado**: ⏳ pendiente confirmación usuario.

---

## D-Streaming — SSE en /chat

**Pregunta**: ¿implementar streaming SSE en v1 o JSON respuesta completa?

**Recomendación**: **JSON completo en v1**. La latencia esperada (~600ms cache hit, ~2.5s cold) no necesita streaming para ser tolerable. Streaming agrega complejidad (frontend SSE handling, error states). Defer a v2 si los usuarios reportan que la espera molesta.

**Estado**: ✅ resuelto (JSON completo).

---

## D-Indexado — Cuándo correr el indexer del folder_tree

**Pregunta**: ¿cuándo se indexa el árbol de carpetas de Drive?

| Opción | Pros | Contras |
|---|---|---|
| **A — Manual via `/admin/index-drive`** | Control total. Solo cuando se agregan carpetas nuevas. | Hay que acordarse. |
| **B — Cron diario** | Auto-detecta carpetas nuevas en <24h. | Carga innecesaria si nada cambió. |
| **C — Drive API push notifications** | Indexa instantáneo. | Más complejo (webhook + renovación de watch channel). Overkill para v1. |

**Recomendación**: **A en v1**, **B en v2** (cron cada 6-12h, GitHub Actions o APScheduler). C cuando haya volumen real.

**Estado**: ✅ resuelto (manual en v1).
