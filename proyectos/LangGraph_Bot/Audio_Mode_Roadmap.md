---
tags: [proyecto, langgraph, fangiocrm, audio, tts, elevenlabs, roadmap]
fecha_inicio: 2026-05-01
estado: en_curso — feature básica funciona, hay bugs de calidad pendientes
prioridad: media
branch: bot-rollback-2026-04-18
---

# Audio Mode — Roadmap de mejoras

> El bot puede responder con audio (ElevenLabs TTS) cuando el cliente dice que no puede leer/escribir (manejando, en moto, etc.). La feature básica está integrada y respondiendo, pero hay bugs concretos a iterar.

## Estado actual (2026-05-01, fin del día)

### Lo que funciona
- ✅ Detección de trigger por **frase explícita** del cliente ("estoy manejando", "no puedo leer", "voy en moto", "te mando audio", "caminando", etc.).
- ✅ Flag `bot:{client_id}:{phone}:audio_mode` en Redis con TTL 15 min.
- ✅ Desactivación por frase OFF explícita ("ya llegué", "ya puedo escribir", "escribime por texto") o TTL natural.
- ✅ Inyección de nota "MODO AUDIO ACTIVO" al `estado_calificacion` antes del LLM.
- ✅ Llamada a ElevenLabs `eleven_multilingual_v2`, descarga MP3 bytes.
- ✅ Envío via Chatwoot `send_audio_bytes()` → Evolution → WhatsApp.
- ✅ Fallback silencioso a texto si TTS falla (no se pierde el turno).
- ✅ Strip de emojis pre-TTS (los emojis se pronuncian raro o se ignoran).
- ✅ Settings de voz ajustados (stability 0.65, style 0.2, similarity_boost 0.8) para más estabilidad en español.

### Lo que NO funciona bien todavía
- ⚠️ **El audio "se come" palabras o las pronuncia mal** — depende mucho de la voice ID elegida. Voces no entrenadas para español saltan sílabas en multilingual_v2.
- 🔴 **El LLM responde con formato lista/ficha cuando el modo audio está activo**, lo que hace que el TTS lea cosas como "Nissan Tiida | 20.000 km | U$S 15.000" carácter por carácter, soltando "U dólar S" en vez de "dólares" y "guion" en lugar de pausas. Suena robótico y se pierde sentido.

---

## Bug bloqueante #1 — Formato lista/ficha en audio

### Síntoma exacto (ejemplo del usuario, 2026-05-01)

**Lo que dice hoy el bot en audio**:
> "ok te puedo recomendar un nissan tida veinte mil kilometros a quince mil u ese de"

**Lo que debería decir**:
> "ok te puedo recomendar un Nissan Tiida que tiene 20.000 kilómetros. Ese lo tenemos a 15.000 dólares de contado."

### Causa raíz

1. La tool `buscar_inventario_autos` (`bot-service/trebol_bot/agent/tools.py::_format_ficha`) devuelve fichas con formato estructurado:
   ```
   1️⃣ Nissan Tiida
   📅 2018 | 📍 20.000 km
   💰 Contado: U$S 15.000
   📝 Anticipo: U$S 5.000
   ```
   Ese formato es ideal para texto en WhatsApp, pésimo para TTS.

2. El LLM, aunque tenga la nota "MODO AUDIO ACTIVO" inyectada en `estado_calificacion`, **copia parcial o totalmente** el formato de ficha al `mensaje2`. La nota actual le pide "frases cortas, sin emojis, sin listas, sin markdown, números en palabras (escribir 'doce mil quinientos dólares' en lugar de 'U$S 12.500')" pero no es lo suficientemente fuerte / no la respeta consistentemente.

3. ElevenLabs entonces sintetiza esa cadena raw, leyendo "U$S" como "U dólar S", separadores `|` como "guion" o pausas, etc.

### Opciones de fix (ordenadas por simplicidad)

#### Opción A — Reforzar el prompt con ejemplos concretos antes/después

Cambio en `bot-service/trebol_bot/agent/graph.py` donde se inyecta la nota MODO AUDIO ACTIVO. Agregar ejemplos negativos y positivos textuales:

```
[MODO AUDIO ACTIVO]
Tu respuesta va a ser leída en voz alta — escribí como si lo dictaras por
teléfono. Frases completas, naturales, conversacionales.

PROHIBIDO en este modo:
- Emojis (🚗 1️⃣ 📅 💰 📍 📝 ❌ ✅)
- Caracteres tipo "|" "/" "•" "-" como separadores
- Abreviaturas tipo "U$S", "USD", "km", "Km" → escribir "dólares" y "kilómetros" en palabras
- Precios tipo "12.500" → escribir "doce mil quinientos"
- Listas con guiones, viñetas, numeradas
- URLs

Ejemplos:
MAL:  "Nissan Tiida | 2018 | 20.000 km | U$S 15.000"
BIEN: "Tengo un Nissan Tiida 2018 con 20.000 kilómetros, sale 15.000 dólares de contado."

MAL:  "Te paso opciones: 1️⃣ Hilux 2020 - 80mil km - U$S 25.000"
BIEN: "Tengo una Hilux 2020 con 80.000 kilómetros que sale 25.000 dólares al contado."

Máximo 2-3 frases en TOTAL.
```

**Pro**: cero costo, solo prompt engineering.
**Contra**: depende de que el LLM obedezca. gpt-4.1-mini puede seguir copiando ficha en algunos turnos.

#### Opción B — Post-procesado determinístico antes del TTS (recomendado)

En `webhook/chatwoot.py::_process_and_send`, antes de llamar a `synthesize_speech()`, pasar el texto combinado por un **normalizador para audio** que convierte:

| Patrón | Reemplazo |
|---|---|
| `\|` (separador entre datos) | `, ` (coma + espacio) |
| `U\$S\s*([0-9.]+)` | conversión a palabras → "X mil dólares" |
| `(\d+)\.000\s*km` | "X mil kilómetros" |
| `(\d+)\s*km` | "X kilómetros" |
| `📅 (\d{4})` | "del año $1" |
| `📍 ([^|]+)` | "$1" (solo el valor) |
| `💰 Contado:` | "" (ya está implícito en el contexto) |
| `📝 Anticipo:` | "anticipo de " |
| Emojis `1️⃣ 2️⃣ 3️⃣ 🚗 📅 💰 📝 📍` | "" |
| Saltos de línea múltiples | ". " |

Implementación: un módulo `bot-service/trebol_bot/integrations/tts_text_normalizer.py` con `normalize_for_tts(text: str) → str`. Llamado en `_process_and_send` antes del strip de emojis genérico.

**Pro**: independiente del LLM, garantizado. Fix robusto.
**Contra**: requiere mantener el normalizador (si cambia el formato de ficha hay que actualizar).

#### Opción C — Tools dual-mode (modo audio devuelve prosa)

En `tools.py::buscar_inventario_autos`, leer el flag `audio_mode` desde Redis (vía ContextVar `current_client_id` + phone que tendría que propagarse) y, si está activo, formatear las fichas en prosa natural en lugar de `_format_ficha`. Algo como:

```python
def _format_ficha_prosa(m: dict) -> str:
    return (
        f"{m['MARCA']} {m['MODELO']} {m.get('ANIO', '')}"
        f" con {m.get('KM_palabras', '')} kilómetros, "
        f"sale {m.get('PRECIO_palabras', '')} dólares de contado."
    )
```

**Pro**: arquitectónicamente más limpio. La tool sabe en qué modo está.
**Contra**: invasivo (toca tools, requiere propagar phone/audio_mode flag adentro del ContextVar). El LLM puede igual armar listas a partir de la prosa.

#### Opción D — LLM secundario de reformateo

Pasar el texto del LLM principal por un segundo LLM con prompt "reescribí esto para que se lea en voz alta natural en español rioplatense". Costo extra (1 LLM call más + latencia + tokens). NO recomendado por costo y latencia.

### Recomendación para mañana

**Opción A + Opción B** combinadas:
1. Primero implementar la Opción B (normalizador determinístico) — garantiza que el audio nunca diga "U dólar S" aunque el LLM se equivoque.
2. Reforzar el prompt con la Opción A para que el LLM intente generar prosa desde el origen (mejor input → mejor output del normalizador).

Si después del combo A+B sigue habiendo casos raros, evaluar Opción C como evolución arquitectónica.

---

## Bug pendiente #2 — Voice ID de calidad inconsistente

La voice actual (`MjtZn5tagxL1RO6w9ER5`) no es de los defaults — fue elegida por el usuario, probablemente del Voice Library. Síntomas: se come palabras al pronunciar español.

### Acción para mañana
Probar voces default que están entrenadas para español:

| Voice | Voice ID | Notas |
|---|---|---|
| Antoni | `ErXwobaYiN019PkySvjV` | Default, español neutro, bueno con voseo |
| Adam | `pNInz6obpgDQGcFmaJgB` | Default, masculino profundo |
| Daniel | `onwK4e9ZLuTAKqWW03F9` | Default, multilingual |

Cambio: solo `.env` + `docker compose up -d --no-deps --force-recreate trebol-test-bot` (sin rebuild). Probar 1-2 frases del flow normal del bot a cada voz y comparar.

Si ninguna voz default es satisfactoria → upgrade a plan Starter ($5/mes) y elegir una de la library con buena calidad rioplatense, o eventualmente Plan Creator ($22/mes) con voice cloning de una voz argentina real.

---

## Pendiente #3 — Manejo de cuota / errores TTS

Cuando ElevenLabs devuelve error (402 voice library, 429 cuota, 401 key inválida), hoy se loggea y cae a fallback texto. Eso está OK pero puede mejorar:

- **Alerta al admin** la primera vez que aparece error de cuota / key, para que el usuario vea inmediatamente que TTS no anda.
- **Cache temporal de "TTS broken"** (30 min) para no martillar la API si está rota — actualmente cada turno reintenta.
- **Métrica simple**: contador en Redis de TTS exitosos / fallidos por día, expuesto por `/health` o endpoint debug.

Prioridad baja — no afecta funcionalidad si el fallback a texto está OK.

---

## Pendiente #4 — Calidad del texto antes del audio (mejor LLM-side)

Aún con Opción A+B implementadas, el LLM puede generar textos largos cuando el modo audio está activo. Hoy hay truncado a 800 chars en `_smart_truncate` pero sería mejor que el LLM directamente genere respuestas más cortas en modo audio.

Idea: en la nota MODO AUDIO ACTIVO, agregar **límite duro de palabras** ("máximo 30 palabras en TOTAL") en vez de "2-3 frases" (que el LLM interpreta laxamente).

---

## Próximos pasos sugeridos (orden propuesto para mañana)

1. **Implementar normalizador determinístico** (Opción B del bug #1) — `bot-service/trebol_bot/integrations/tts_text_normalizer.py`. Tests unitarios simples.
2. **Reforzar prompt MODO AUDIO** (Opción A del bug #1) — ejemplos antes/después en `graph.py`.
3. **Probar Antoni** como voice_id default — comparar calidad vs voice actual.
4. **Test end-to-end**: flujo completo (texto → modo audio → texto), verificar que prosa suena natural y entendible.
5. **Commit + push** del feature TTS completa cuando quede estable. Hoy quedó como WIP en branch `bot-rollback-2026-04-18` (commits `5d8f1a7`, `0f164cf` + cambios sin commitear).

---

## Decisiones tomadas hoy (2026-05-01)

- Trigger de activación: **solo frase explícita del cliente** (no se activa por mandar audio).
- Trigger de desactivación: **solo frase OFF explícita** o TTL natural (NO se desactiva por mensaje largo de texto — el cliente puede dictar largo via Whisper).
- TTL: **15 minutos** (subible si hace falta).
- Audio único concatenado por turno, no 3 audios por bubble.
- Fallback a texto silencioso si TTS falla.

---

## Links

- [[Pipeline_Estructura]] — estructura general del bot.
- `bot-service/trebol_bot/integrations/tts_elevenlabs.py` — cliente TTS.
- `bot-service/trebol_bot/memory/audio_mode.py` — flag Redis.
- `bot-service/trebol_bot/webhook/chatwoot.py` — detección + ramificación.
- `bot-service/trebol_bot/agent/graph.py` — inyección de nota al prompt.
