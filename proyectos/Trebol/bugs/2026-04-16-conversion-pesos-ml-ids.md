---
tags: [bug, trebol, v4, conversion, prod, test]
fecha: 2026-04-16
estado: fix en test, pendiente prod
nodo: Inyectar Conversión Pesos
---

# Bug: Conversión de pesos falla con links ML + tasa venta crea exclusión límite

## Síntoma observado

El bot en prod no recomienda autos con precio menor a ~10 millones de pesos, pese a que existen en stock vehículos a U$S 5.000 (≈7M pesos al tipo de cambio actual).

## Root cause — dos bugs encadenados

### Bug A — ML listing ID capturado como presupuesto en pesos (crítico)

El nodo `Inyectar Conversión Pesos` aplica Pattern 3 `(\d{7,})\s*(?:pesos?|ARS)?` sobre el **texto completo del mensaje**, incluyendo URLs. Cuando un cliente envía un link de MercadoLibre, el ID del listing (10 dígitos, ej: `MLA-1694594131`) matchea el patrón y se trata como un monto de ~1.694 millones de pesos:

```
Mensaje: "Hola, preguntas sobre Ford Focus. https://...MLA-1694594131-ford-focus..."
Pattern 3 captura: 1694594131 → ≈ 1.694 millones de pesos → U$S 1.212.156
```

El LLM recibe `[CONTEXTO DE SISTEMA] presupuesto: U$S 1.212.156` — interpreta que el cliente tiene U$S 1.2 millones. Como todos los autos están "dentro de presupuesto", muestra los más populares/mejor rankeados semánticamente, que suelen ser los más caros. Los autos baratos (que rankean peor en vector search para queries genéricas) no aparecen.

**Evidencia**: exec 20848 prod (2026-04-13), mensaje ML Focus → `$1694.6M ≈ U$S 1.212.156`.

Este bug afecta a **la mayoría de los usuarios que llegan por MercadoLibre** (path principal de generación de leads).

### Bug B — Tasa de venta crea exclusión en el límite (menor)

El nodo usa `blue.value_sell` (tasa de venta del blue, la más alta) para convertir el presupuesto del cliente de pesos a USD. Al tipo de cambio actual (venta: $1.410 ARS/USD):

```
7.000.000 pesos / 1410 = 4.965 USD
```

Un auto a U$S 5.000 tiene `precio_contado (5000) > techo (4965)` → excluido por regla del system prompt.

El mismo auto en pesos: 5.000 × 1.410 = **$7.050.000** — apenas 50.000 pesos sobre el presupuesto del cliente.

Usando la tasa media (compra: $1.390 + venta: $1.410) / 2 = $1.400:
```
7.000.000 / 1400 = 5.000 USD exactos → incluido ✓
```

## Ambiente afectado

| Ambiente | Bug A | Bug B |
|----------|-------|-------|
| PROD     | ✅ afectado (Pattern 3 sin strip URL, Pattern 1 sin `M\b`) | ✅ afectado (usa `value_sell`) |
| TEST     | ✅ afectado (Pattern 3 sin strip URL — mismo código) | ✅ afectado (usa `value_sell`) |

## Fix aplicado (2026-04-16, test)

**Bug A**: Eliminar URLs del mensaje ANTES de aplicar los patterns:
```javascript
const mensajeSinUrls = mensaje.replace(/https?:\/\/[^\s]+/gi, '');
// Aplicar patterns sobre mensajeSinUrls en vez de mensaje
```

**Bug B**: Usar promedio compra/venta (mid rate) en vez de solo venta:
```javascript
const dolarBlueSell = $('Fetch Dólar Blue').first().json?.blue?.value_sell || 0;
const dolarBlueBuy  = $('Fetch Dólar Blue').first().json?.blue?.value_buy  || dolarBlueSell;
const dolarBlue = (dolarBlueSell > 0 && dolarBlueBuy > 0)
  ? (dolarBlueSell + dolarBlueBuy) / 2
  : dolarBlueSell;
```

El mensaje de contexto refleja el cambio: `"Dólar blue hoy (promedio compra/venta): $X"`.

## Verificación post-fix

| Caso | ANTES | DESPUÉS |
|------|-------|---------|
| Link ML `MLA-1694594131` | `$1694.6M ≈ U$S 1.212.156` (falso) | Sin conversión (URL removida) |
| "tengo 7 millones" (tasa 1410/1390) | `$7M ≈ U$S 4.965` → auto 5000 USD excluido | `$7M ≈ U$S 5.000` → incluido |
| "tengo 7.000.000" | detectado por Pattern 4 (test) | igual |
| "tengo U$S 5000" (sin pesos) | sin conversión | sin conversión (correcto) |

## Estado

- [x] Fix aplicado en `workflows/trebol_v4_test.json` — nodo `Inyectar Conversión Pesos` (2026-04-16)
- [ ] Deploy a PROD — requiere validar en test primero (no requiere spec por ser hotfix puntual)
- [ ] Limpiar memoria test post-deploy: `bash scripts/clear-chat-memory.sh 5491150635028`

## Links

- [[Workflow_v4_Reference]] — pipeline v4
- [[Malas]] — índice conversaciones malas
- [[Roadmap]] — estado deploy prod
