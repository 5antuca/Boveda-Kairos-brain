# AI Tester — Regression Testing para Trebol v3

Suite de regression tests que simula conversaciones reales contra el workflow Trebol v3 Test en n8n.

## Cómo funciona

1. Crea contacto + conversación real en Chatwoot TEST
2. POST directo al webhook de n8n TEST (simula mensaje de cliente)
3. Espera que el bot procese y responda via Chatwoot
4. Lee las respuestas del bot via Chatwoot API
5. Evalúa contra criterios definidos (must_contain, must_not_contain, etc.)
6. Cleanup: resuelve conversación + limpia Redis

## Comandos

```bash
# Correr TODOS los tests (14 tests, ~15 min)
bash scripts/run-tests.sh

# Correr UN test específico
bash scripts/run-tests.sh tm-03
bash scripts/run-tests.sh tb-01

# Ver último resultado
ls -t tests/results/ | head -1 | xargs -I{} cat tests/results/{}
```

## Tests disponibles

### Comportamiento correcto (TB = Test Bueno)

| ID | Escenario | Qué verifica |
|----|-----------|--------------|
| TB-01 | ML link con vehículo en stock | Ficha correcta + fotos + precio |
| TB-02 | ML link + permuta | Derivación a admin sin prometer toma |
| TB-03 | Papeles (deuda) | Auto-respuesta + derivación |
| TB-04 | Precio desactualizado | No confrontar diferencia de precio |
| TB-05 | Lote como permuta | Rechazar lote correctamente |
| TB-06 | Flujo completo multi-turno | Hasta handoff limpio |
| TB-07 | No stock + pedido | Ofrece anotar en lista |

### Errores prohibidos (TM = Test Malo)

| ID | Error que NO debe repetir | Qué verifica |
|----|---------------------------|--------------|
| TM-01 | "Podemos tomar tu auto" | NO prometer toma en permuta |
| TM-02 | "pido 30000" = presupuesto | NO confundir precio permuta con presupuesto |
| TM-03 | Mostrar alternativas sin stock | NO mostrar otros autos — solo proponer pedido |
| TM-04 | JSON crudo al cliente | Parser maneja JSON duplicado |
| TM-05 | "si avisame" busca por presupuesto | Registrar pedido, NO buscar alternativas |
| TM-06 | Cuotas sin vehículo elegido | NO ofrecer financiación sin stock |
| TM-07 | Mensajes en orden incorrecto | Primer mensaje = info, no pregunta |

## Cuándo correr tests

| Cambio realizado | Tests a correr |
|------------------|----------------|
| System prompt del AI Agent | Todos (`run-tests.sh`) |
| Parsear Respuesta | TM-04, TM-07 |
| Clasificador Contextual | TM-02, TM-03, TM-05, TM-06 |
| Construir Instrucciones | TB-06, TB-07, TM-01, TM-05 |
| Flujo de envío de mensajes | TM-07 |
| CRM o alertas | TB-02, TB-03, TM-01 |
| Antes de merge a prod | Todos |

## Criterios de evaluación

| Criterio | Tipo | Lógica |
|----------|------|--------|
| `must_contain` | Array | TODOS deben estar en algún mensaje del bot |
| `must_contain_any` | Array | AL MENOS UNO presente |
| `must_contain_any_2` | Array | AL MENOS UNO presente (segundo grupo) |
| `must_not_contain` | Array | NINGUNO debe estar presente |
| `must_have_photos` | Boolean | Al menos 1 attachment |
| `max_messages` | Number | Bot no envía más de N mensajes |
| `order_check` | Object | Primer mensaje cumple criterios propios |

## Archivos

```
scripts/run-tests.sh          # Script principal
tests/fixtures/tb-*.json      # Fixtures de tests buenos
tests/fixtures/tm-*.json      # Fixtures de tests malos
tests/results/run_*.log       # Logs de resultados (gitignored)
```

## Configuración

El script usa estos valores por defecto (no requiere config manual):

- Webhook: `https://test-trebol.n8n.kairosaisolutions.com/webhook/fd88e196-87b4-4851-9f9f-09a8a7a22d22`
- Chatwoot TEST: account_id=2, inbox_id=2
- Token: hardcodeado en script (entorno test solamente)
- Wait time: 20s entre turnos (debounce + AI processing)

## Agregar un test nuevo

Crear un JSON en `tests/fixtures/` con esta estructura:

```json
{
  "id": "TX-99",
  "name": "Descripcion del test",
  "messages": [
    "primer mensaje del cliente",
    "__WAIT_20__",
    "segundo mensaje (después de esperar 20s)"
  ],
  "wait_seconds": 20,
  "must_contain_any": ["texto esperado"],
  "must_not_contain": ["texto prohibido"]
}
```

El `__WAIT_N__` entre mensajes simula la pausa del cliente (necesario para que el bot procese el turno anterior).

## Limitaciones

- **Dependencia de stock**: Tests TB-01 a TB-06 dependen del inventario real de MongoDB
- **Timing**: Cada test tarda ~20-40s. Suite completa ~15 min
- **Evaluación string-based**: No evalúa semántica profunda, solo presencia/ausencia de texto
- **Secuencial**: Los tests corren de a uno para evitar colisiones en Redis
