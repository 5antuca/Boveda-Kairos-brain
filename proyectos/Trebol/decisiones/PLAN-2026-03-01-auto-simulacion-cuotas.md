# PLAN: Auto-simulación de cuotas + sync workflow live → repo

**Fecha:** 2026-03-01
**Workflow objetivo:** `actualprod` — entorno TEST (`UhGVZx2kcdiJmLB2OVoBz`)
**Archivo:** `workflows/actualprod_test.json`
**Estado:** ✅ EJECUTADO — 2026-03-01T06:31:47 UTC

---

## Problema

1. **Cuotas no integradas en financiación:** Cuando el cliente pregunta por financiación y el bot ya sabe qué auto le interesa, el agente solo lista las opciones generales y cierra con "¿Querés que te conecte con un asesor?". NO simula cuotas automáticamente, a pesar de tener la tool `calcular_cuotas` disponible.

2. **Plazos no disponibles mencionados:** El bot decía "24 y 36 cuotas no disponibles en esta simulación" — confunde al cliente con información irrelevante.

3. **Repo desincronizado:** El archivo `actualprod_test.json` en el repo no reflejaba el estado real del workflow en el VPS.

---

## Cambios aplicados

### 1. System prompt — sección FINANCIACIÓN

**Antes:**
```
"financiación/anticipo/opciones de pago" → usar OPCIONES DE FINANCIACIÓN.
  Cerrar: "¿Querés que te conecte con un asesor para armar un plan a medida?"
```

**Después:**
```
"financiación/anticipo/opciones de pago" → usar OPCIONES DE FINANCIACIÓN.
  Si ya sabés qué vehículo le interesa → además de opciones generales, llamá a
  calcular_cuotas con precio_contado y anticipo=0 para integrar simulación concreta.
  Si NO sabés el vehículo → preguntar qué vehículo le interesaría financiar.
REGLA CUOTAS: Mostrá SOLO cuotas de 3, 6 y 12 meses. NUNCA menciones plazos
que no estén disponibles.
```

### 2. Edit Fields6 (path financiación, Switch1 out5)

**Antes:** Solo instruía usar OPCIONES DE FINANCIACIÓN.

**Después:** Si hay vehículo en CRM, instruye:
1. Consultar OPCIONES DE FINANCIACIÓN (opciones generales)
2. Buscar precio_contado del vehículo con `buscar_inventario_autos`
3. Llamar `calcular_cuotas` con precio_contado y anticipo=0
4. Integrar simulación privada en la respuesta (solo 3, 6, 12 meses)

### 3. Edit Fields Cuotas (path cuotas, Switch1 out6)

Reforzada la regla MOSTRAR:
```
NUNCA menciones plazos que no estén disponibles — si 24 o 36 cuotas
no tienen datos, NO los nombres en la respuesta.
```

### 4. Sync repo ← VPS live

El archivo `actualprod_test.json` se descargó directo del VPS (API n8n) para reflejar el estado real (Wait habilitado con 3s, nodos Fetch Dólar Blue e Inyectar Conversión Pesos ya incluidos del plan anterior).

---

## Test

Enviar por WhatsApp:
> "me interesa el gol trend 2010, lo puedo sacar en cuotas?"

**Resultado esperado:**
- Bot busca el Gol Trend 2010 en inventario (precio contado)
- Llama `calcular_cuotas` automáticamente con el precio y anticipo=0
- Muestra cuotas de 3, 6 y 12 meses
- NO menciona 24 ni 36 meses
- NO ofrece "¿querés que te conecte con un asesor?"

---

## Rollback

1. Revertir las 3 modificaciones de texto (system prompt, Edit Fields6, Edit Fields Cuotas)
2. Re-deploy con el JSON anterior (commit previo en git)
