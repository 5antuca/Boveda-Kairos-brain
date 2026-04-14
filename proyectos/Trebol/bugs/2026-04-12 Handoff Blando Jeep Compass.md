---
tags: [memoria, volcado, trebol, bug, postmortem, handoff, tutoría]
fecha_volcado: 2026-04-13
fecha_bug: 2026-04-12
workflow: chkkStDHenGFhwE7 (test)
status: fix deployado test, smoke test pendiente, prod no tocado
---

# Tutoría: Bug Handoff Blando Trebol v4 (Jeep Compass)

Este es el bug más educativo de la serie F1-F4 porque es una clase nueva: no era un fix de prompt ni de regex, era un **gap arquitectónico de side effects**.

Ver también: [[results/bad-conv-20260412-v4-jeep-compass-handoff-blando]] en el repo.

## Síntoma del cliente

Cliente escribe: *"tengo preguntas sobre Jeep Compass [link ML]"*. Flujo normal hasta que el bot dice: *"Ya te pongo en contacto con administración"* (= handoff). **Desde ese punto el bot debería apagarse**. En cambio:

1. Cliente: *"no hay problema, sin apuro"*
2. Bot (❌): *"Cuando quieras, decinos qué vehículo te interesa para que busquemos las opciones disponibles"*
3. Cliente re-envía link ML del mismo Jeep
4. Bot (❌): re-muestra la ficha completa, activa nueva guardia permuta, pide año/km/estado/fotos otra vez, **dispara segundo handoff**

El bot ignoró completamente el primer handoff y reinició la conversación.

## Diagnóstico — las 3 capas del bug

### Capa 1: el workflow LEÍA `bot_status` pero nunca lo SETEABA

El Switch2 del pipeline (líneas ~569/593 de `trebol_v4_test.json`) bifurcaba en `bot_status === 'off'` → skip pipeline. Pero `bot_status` venía del payload del webhook de Chatwoot como lectura pasiva del `custom_attributes.bot` del conversation. **Nada en el workflow lo escribía**.

Conclusión inicial (incorrecta): "el bot_off depende de que un humano clickee el toggle en la UI de Chatwoot".

### Capa 2: Los nodos `Set Bot Off` usaban Postgres `dblink_exec` contra la DB de Chatwoot

Había 3 nodos: `Set Bot Off` (handoff), `Set Bot Off1` (foto), `Set Bot Off2` (papeles). Los 3 ejecutaban:
```sql
SELECT dblink_exec(
  'host=... dbname=chatwoot user=...',
  'UPDATE conversations SET custom_attributes = jsonb_set(custom_attributes, ''{bot}'', ''"off"'') WHERE id = ...'
)
```

Verificamos en la DB de Chatwoot con `psql`: **el UPDATE sucedía** (exec 20365: `UPDATE 1`, conv 323 → `{"bot":"off"}`).

Entonces ¿por qué seguía respondiendo?

### Capa 3 (el root cause real): Chatwoot no refleja updates via dblink en el payload del webhook

Revisamos los siguientes 10 webhook payloads post-update parseando `execution_data` con `flatted`:
```
exec 20365, 20369, 20371, 20374, 20378, 20381, 20388, 20391, 20395, 20403
→ TODOS tenían: custom_attributes: {}
```

**Chatwoot serializa el conversation desde Rails al disparar el webhook.** Si el UPDATE bypassa Rails (via dblink directo a Postgres), el serializer no se entera y el JSON que emite sigue trayendo el estado viejo. El bot nunca ve `bot_status=off`.

Lección técnica: **los side effects a Chatwoot tienen que pasar por la API HTTP (Rails)**, no por dblink, si después vas a leer ese mismo dato desde un webhook.

## Fix deployado (Fase 5 handoff duro)

Tres niveles de defensa combinados. Ninguno solo basta.

### 1. Reemplazar los 3 `Set Bot Off*` de dblink → HTTP PATCH Chatwoot API

```
PATCH https://{CHATWOOT_DOMAIN}/api/v1/accounts/{acount_id}/conversations/{converssation_ID}/custom_attributes
headers: api_access_token = {CHATWOOT_TOKEN}
body: { "custom_attributes": { "bot": "off" } }
```

typeVersion `4.2` (httpRequest moderno). Pasa por Rails → serializer se entera → siguientes webhooks traen `bot: "off"`.

### 2. Redis como source of truth (no dependemos de Chatwoot API availability)

Después de cada `Set Bot Off*`, dos nodos nuevos por motivo:
- `Redis SET Bot Off [handoff|foto|papeles]` → key `{chat_id}:bot_off` con valor = motivo, TTL 72h (259200s)
- `Alerta Bot Off [handoff|foto|papeles]` → POST a `{INTERNAL_WEBHOOK_URL}/webhook/alertas-vendedores` con `tipo_alerta: bot_off`, telefono, motivo, conversation_url

Propósito: aunque el webhook de Chatwoot falle en reflejar el custom_attributes, Redis tiene el flag. Sobrevive a reinicios del bot, no depende de Chatwoot API availability.

### 3. Early pipeline gate (short-circuit antes de cualquier LLM call)

Entre `Edit Fields` y `If9`, dos nodos nuevos:
- `Redis GET Bot Off Flag` → key `{chat_id}:bot_off`, propertyName `bot_off_flag`
- `IF Bot Off Flag` → condition `$json.bot_off_flag` notEmpty
  - **true** → dangling (no connection = silence)
  - **false** → flujo normal hacia If9

Ventaja: cualquier mensaje del cliente post-handoff entra, encuentra el flag, y sale sin responder. **Cero LLM calls desperdiciados.**

### 4. AlertasVendedores — case `bot_off` nuevo

En `alertasvendedores_test.json`:
- Nuevo output del Switch Tipo Alerta: `bot_off`
- Nuevo Code node `Formatear Bot Off` que genera el mensaje al grupo de administración:
  ```
  🛑 *BOT APAGADO* 🛑
  📱 Teléfono: ...
  🔧 Motivo: Derivación a administración | Trámite de papeles | Cliente envió foto
  🔗 Tomá la conversación: {chatwoot_url}
  ⏰ {timestamp AR}
  ```

Así los vendedores saben **por qué** el bot se apagó para ese chat y pueden tomar la conversación desde la UI.

## Archivos afectados

- `workflows/trebol_v4_test.json` — 141 → 149 nodos (+8)
- `workflows/alertasvendedores_test.json` — +1 case Switch + Formatear Bot Off
- `scripts/apply_bot_off_fix.py` — patch idempotente
- `results/bad-conv-20260412-v4-jeep-compass-handoff-blando.md` — doc del caso
- Backups: `.bak.pre-bot-off-fix` en ambos JSONs

## Lecciones generalizables

1. **Si un webhook te trae datos que también modificás, modificalos por el mismo canal que emite el webhook.** dblink bypass = invalidación de cache del serializer = inconsistencia silenciosa.
2. **Un flag en Redis + gate temprano en el pipeline vale más que cualquier fix de prompt.** La IA no tiene que "aprender" a no responder — simplemente no llega a ejecutarse.
3. **Side effects de dominio (apagar el bot) son 3 cosas**, no 1:
   - Persistir el estado (DB / Chatwoot API)
   - Cachear el estado accesible rápido (Redis)
   - Notificar a humanos (alerta a vendedores)
   Si falta cualquiera de las 3, el fix es incompleto.
4. **Bugs B/C/D eran corolarios de A.** Una vez resuelto el handoff duro, los otros 3 (re-envío link reinicia ciclo, respuesta fuera de contexto, "qué vehículo te interesa" post-alerta) desaparecen solos porque nunca se llega a ejecutarlos.

## Cómo verificar el fix (smoke test pendiente)

Mandar al número test `5491150635028` un escenario Jeep Compass:
1. T1: "Hola, preguntas sobre Jeep Compass [ML link]"
2. T2-T5: permuta completa hasta handoff
3. T6: "sin apuro" → **SILENCIO esperado**
4. T7: re-envía link → **SILENCIO esperado**

Checks:
- `redis-cli -a ... GET v3:5491150635028@s.whatsapp.net:bot_off` → debe retornar `handoff` (o `foto`/`papeles`)
- `SELECT custom_attributes FROM conversations WHERE id = ...` en Chatwoot → `{"bot":"off"}`
- Grupo vendedores recibe mensaje "🛑 BOT APAGADO 🛑"
- `n8n_chat_histories` post T6/T7: **no** aparecen rows nuevos con `type=ai`

## Pendiente

- [ ] Smoke test real del fix
- [ ] Una vez validado en test → migrar fix a prod (requiere pedido explícito)
- [ ] Helper `assert_no_response` en `scripts/test_conversation.sh` para automatizar regresión

## Links

- [[Pipeline_v4]]
- [[Chatwoot_Evolution_Quirks]]
- [[n8n_Gotchas]]
- [[Redis_Postgres_Debug]]
