---
tags: [proyecto, langgraph, vision, openai, attachments]
fecha: 2026-05-01
estado: vigente — solo test
---

# Vision Classifier — clasificación de imágenes WhatsApp

Cuando el cliente adjunta una o más imágenes en Chatwoot, el bot llama a un LLM multimodal (`gpt-4.1-mini`) que extrae **solo lo que se ve** (datos del vehículo, fuente, descripción), e inyecta esa info como contexto al agent principal. El agent decide la intención (compra vs venta vs permuta) con todo el contexto de conversación — el vision classifier NO infiere intención.

## Por qué se separó la clasificación de la intención

Antes (workflow n8n y primer cutover Python): el bot recibía `[cliente envió N fotos]` como único marker — el LLM no sabía qué auto era ni si era screenshot o foto cruda, así que improvisaba. Falsos positivos típicos: confundir captura de un auto en MercadoLibre con foto del auto del cliente para permutar.

Idea descartada (un único LLM clasifica + decide intent): el clasificador no tiene contexto de conversación, así que la decisión final podía ser inconsistente con el turno anterior del bot.

Idea adoptada: **separar OCR visual de decisión de intent**. Vision LLM solo describe la imagen. Agent principal decide el flujo basado en texto del cliente + historial + descripción de la imagen.

## Arquitectura

```
Chatwoot webhook → handle_chatwoot_event()
  ├── Detecta attachments (audio/imagen)
  └── Si imagen:
       1. Recolecta data_url(s)
       2. classify_images(urls)            ← OpenAI gpt-4.1-mini multimodal
       3. build_vision_marker(N, result)   ← String formateado
       4. Inyecta marker al `content` del agent
       └── Si vision API falla → handoff directo a admin
            (mensaje fijo + bot_off + alerta lead_caliente)
```

### Output del vision LLM (JSON estricto)

```json
{
  "es_vehiculo": true | false,
  "vehiculo": {
    "marca": "Toyota" | null,
    "modelo": "Hilux" | null,
    "version": "SRX 4x4" | null,
    "anio": "2018" | null,
    "color": "blanca" | null
  },
  "source": "screenshot" | "raw_photo" | "otro",
  "descripcion": "frase corta ≤20 palabras"
}
```

- `es_vehiculo=false` cuando no es un auto/camioneta/moto (DNI, captura de chat, meme). En ese caso `vehiculo` queda todo en null.
- `source="screenshot"` si hay UI de portal (ML/OLX/Marketplace), watermarks, precios listados, fondo sintético, texto sobreimpreso con specs, o captura de WhatsApp.
- `source="raw_photo"` si es foto cruda de teléfono (calle, garage, ángulo natural).
- `descripcion` en español, neutral, descriptiva. Se usa solo si el agent la necesita para preguntar algo.

### Marker inyectado al agent

`build_vision_marker(N, result)` arma uno de estos formatos:

```
[Cliente envió 3 fotos. Vehículo identificado: Toyota Hilux SRX 4x4, año 2018, color blanca. Fuente: raw_photo (foto cruda de teléfono). Descripción: 3 fotos de Hilux blanca en garage.]
```

```
[Cliente envió 1 foto que NO son de un vehículo. Descripción visual: captura de DNI argentino.]
```

El marker se concatena al texto del cliente con `\n`, no lo reemplaza:

```
"este es mi auto"
[Cliente envió 1 foto. Vehículo identificado: Volkswagen Gol, color blanco. Fuente: raw_photo. Descripción: foto cruda de Gol blanco en calle.]
```

## Cómo usa esto el agent principal

El system prompt (`configs/prompts/trebol.txt`) tiene una sección nueva `[FOTOS RECIBIDAS DEL CLIENTE]` con 5 reglas en orden de prioridad:

1. **Texto del cliente manda**: "tengo este" / "para permutar" → permuta. "tienen este?" / "cuánto sale?" → compra.
2. **Contexto del turno anterior**: si el bot pidió fotos para permuta → es permuta aunque no haya texto del cliente.
3. **Sin texto + sin contexto claro**:
   - `source=screenshot` → asumí compra (cliente típicamente manda screenshots de portales que le interesan).
   - `source=raw_photo|otro` → preguntá: *"¿Este es un auto que querés vender o uno que viste y te interesa?"*
4. **`es_vehiculo=false`** → no fuerces flujo, respondé natural.
5. **Nunca describir la imagen al cliente literalmente** — el cliente ya sabe lo que mandó.

## Comportamiento ante fallos

| Fallo | Comportamiento |
|---|---|
| OpenAI Vision API timeout / 5xx / parse error | Handoff directo a admin: mensaje fijo *"Recibimos las fotos, ya las ve administración..."* + `set_bot_off(reason="vision_classifier_failed")` + alerta `lead_caliente` |
| URL de imagen muerta | Igual al anterior (la API devuelve error y caemos al mismo branch) |
| `es_vehiculo=false` | El marker dice "NO son de un vehículo", el agent responde natural según contexto |
| Múltiples imágenes del mismo vehículo | Una sola call con todas las URLs — el LLM consolida en un único output |
| Imágenes de vehículos distintos en el mismo turno | El LLM usa la imagen con más info; corner case raro (cliente típicamente manda fotos del mismo auto) |

## Costos y latencia

- **Modelo**: `gpt-4.1-mini` con `detail=low` para minimizar tokens visuales (~85 tokens por imagen).
- **Latencia estimada**: 1-2s adicionales al turno cuando hay imágenes (call extra al LLM antes del agent).
- **Costo**: marginal — un tweet de tokens por imagen. Promediando 5 fotos por permuta, está en el orden de fracciones de centavo por turno.

## Bypass de alerta `tipo_alerta=foto`

La alerta al vendedor sigue saliendo igual que antes (con dedup Redis 30min, key `bot:{cid}:{tel}:alerta_foto`). El vision classifier NO la condiciona — el vendedor recibe la alerta aunque la imagen sea un DNI o un meme. Decisión consciente: preferimos falsos positivos al vendedor (que decide) que filtrar y perder fotos legítimas.

## Archivos involucrados

| Path | Rol |
|---|---|
| `bot-service/trebol_bot/integrations/vision_classifier.py` | `classify_images()` + `build_vision_marker()` |
| `bot-service/trebol_bot/webhook/chatwoot.py` | Recolecta URLs en el loop de attachments + inyecta marker o derivación |
| `bot-service/configs/prompts/trebol.txt` | Sección `[FOTOS RECIBIDAS DEL CLIENTE]` con reglas de interpretación |

## Cómo testear end-to-end

1. **Screenshot de ML + texto compra**: mandar screenshot de MercadoLibre con un Toyota Hilux + texto "tienen este?" → bot llama `buscar_inventario_autos` con marca+modelo identificados.
2. **Foto cruda sin texto + conversación nueva**: mandar foto de tu auto sin texto → bot pregunta *"¿Este es un auto que querés vender o uno que viste y te interesa?"*.
3. **Foto cruda + texto permuta**: foto de tu auto + texto "tengo este para permutar" → arranca FLUJO PERMUTA pidiendo año/km/estado.
4. **Imagen no-vehículo**: mandar captura de DNI → bot responde natural sin forzar flujo.
5. **Forzar fallo de vision**: setear `OPENAI_API_KEY=invalid` temporalmente y mandar foto → bot responde con frase de handoff + queda en bot_off.

## Limitaciones conocidas (backlog)

- **Tamaño de imagen**: Active Storage de Chatwoot firma URL con tokens embebidos sin expiración (`exp:null`), pero si la imagen pesa demasiado OpenAI puede rechazarla. No medido aún.
- **Múltiples vehículos en una imagen**: el modelo elige uno; no devuelve array.
- **Hairpin NAT**: a diferencia del pipeline de audio (que usa `chatwoot_internal_url`), vision pasa el `data_url` público directo a OpenAI. OpenAI hace fetch desde internet, así que no hay problema de NAT — pero si Chatwoot bloquea fetches externos por algún motivo, sería el primer punto a investigar.
- **No hay test automático** del path de attachments — el harness `test_bot.sh` solo simula texto. Validación es manual con WhatsApp real.

## Referencias

- [[Pipeline_Estructura]] §8 (gates de webhook + pre-procesamiento)
- `bot-service/trebol_bot/integrations/vision_classifier.py`
- `bot-service/trebol_bot/webhook/chatwoot.py:483-560` (bloque de imágenes)
- `bot-service/configs/prompts/trebol.txt` (sección `[FOTOS RECIBIDAS DEL CLIENTE]`)
