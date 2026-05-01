---
tags: [proyecto, langgraph, sales-swarm, profiler, psicoperfil, trebol]
fecha_inicio: 2026-04-25
estado: F1 deployada en test (ON), F2-F6 pendientes
spec_fuente: specs/2026-04-25-supreme-sales-swarm.md
---

# Supreme Sales Swarm

Evolución cognitiva del bot Trébol hacia un **Concierge VIP rioplatense** que perfila al cliente y deriva a admin con dossier — no cierra la venta, derivar es el cierre.

## Visión

Un equipo de agentes especializados orquestados por LangGraph, donde:
1. Un **Profiler** detecta el psicoperfil (WORK_MACHINE / PASSION_DRIVE / EXPLORADOR).
2. Un **Specialist** parametrizado por perfil habla en el tono adecuado, con tools sesgadas.
3. Un **Closer** decide cuándo derivar a admin con un Dossier completo + frase canónica humana.

> **Regla maestra del producto**: derivar a admin rápido y humano. Nunca prometer cosas como "no vas a tener que repetir nada" — la promesa se cumple silenciosamente, decirlo lo arruina.

## Estado actual (2026-04-26)

| Fase | Estado | Notas |
|---|---|---|
| **F0** Baseline + harness | ✅ implícita (sesión prev) | Harness `scripts/test_bot.sh` 23/23 pasa |
| **F1** Profiler + Tono Rioplatense | ✅ **deployed test** | Toggle `SUPREME_SWARM_ENABLED=true` en test |
| F2 Soak con tráfico real | ⏸️ pendiente | Necesita reset Groq quota + tráfico real WhatsApp |
| F3 Specialists + tools nuevas | ⏸️ pendiente | reservar_unidad, cotizar_permuta_express |
| F4 Closer + Dossier handoff | ⏸️ pendiente | Helper `is_business_hours(client_id)` |
| F5 Cutover test 100% | ⏸️ pendiente | |
| F6 Cutover prod (canary) | ⏸️ pendiente | Solo con aprobación explícita del usuario |

## Los 3 perfiles

### EXPLORADOR (default sin perfil claro)
- **Cuándo**: primer contacto, saludos, queries vagas, confianza < 0.5.
- **Tono**: cálido, curioso, neutro/sin presión.
- **Tools permitidas**: ninguna hasta que tenga presupuesto + tipo (las llama recién cuando tenga datos).
- **Comportamiento**: hace UNA pregunta abierta para perfilar.

### WORK_MACHINE (racional/ROI)
- **Señales** (cualquiera basta para confianza ≥ 0.7): empresa, factura A, leasing, deducción IVA, "para trabajar/flota", uso intensivo, tono profesional/parco.
- **Tono**: directo, profesional, sin emojis decorativos. Voseo natural ("mirá", "te conviene").
- **Argumentos**: TCO, depreciación, financiación bancaria/leasing, prendado USD, plazos largos.
- **Tools**: `buscar_inventario_autos`, `calcular_cuotas`, `opciones_financiacion` (énfasis bancaria/leasing), `cotizar_permuta_express` (F3).

### PASSION_DRIVE (emocional/FOMO)
- **Señales**: modelo específico raro/deportivo, link ML directo, urgencia, fotos extras, "me enamoré", emojis 🔥😍.
- **Tono**: cálido, cómplice, energía rioplatense. Emojis moderados (✅ 🚗 👌).
- **Argumentos**: exclusividad ("quedan pocos"), reserva rápida, fotos/detalles, financiación propia USD 12 cuotas.
- **Tools**: `buscar_inventario_autos`, `calcular_cuotas`, `opciones_financiacion` (énfasis propia USD), `reservar_unidad` (F3), `cotizar_permuta_express` (F3).

## Sticky behavior

Una vez que el Profiler clasifica con confianza ≥ 0.7, el perfil se **persiste en CRM state** (Redis) y NO se recalifica salvo señales fuertemente opuestas (`cambio_de_perfil=true`).

Implementado en `agent/state.py::merge_persona_into_crm()`:
- Si el perfil nuevo es weak (confianza < 0.5 o EXPLORADOR) y el previo era sticky → preservar el viejo.
- Logging: `persona_sticky_preserved`.

## Estado conversacional persistido (Redis)

```
bot:{client_id}:{phone}:crm_state  (JSON, TTL 7d)
{
  "nombre": "Tomás",
  "presupuesto": "U$S 15.000",
  "techo_usd": 15000,
  "vehiculo_interes": "Toyota Hilux",
  "vehiculo_entrega": null,
  "financia": false,
  "estado": "tibio",
  "handoff": false,
  "alerta_enviada": false,

  // Supreme Sales Swarm
  "buyer_persona": "WORK_MACHINE",
  "persona_confianza": 0.85,
  "persona_senales": ["mencionó factura A", "uso para flota"]
}
```

## Toggle ON/OFF

Variable de entorno: `SUPREME_SWARM_ENABLED` (default `false`).

```bash
# Activar en test
echo "SUPREME_SWARM_ENABLED=true" >> environments/test/trebol/.env
unset GEMINI_API_KEY GROQ_API_KEY  # evitar override del shell
docker compose up -d --no-deps --force-recreate trebol-test-bot
```

**Cuando OFF**: el grafo corre como v10 legacy. El profiler no se invoca. Cero costo extra.
**Cuando ON**: profiler corre, `psicoperfil_bloque` se inyecta en system prompt vía placeholder `{PSICOPERFIL_BLOQUE}`.

Si Gemini/Groq fallan o la calidad cae, rollback = un env var (no cambio de código).

## Frase canónica de handoff (para F4)

- **Dentro de horario** Lun-Vie 9-18, Sáb 9-13 hora Argentina:
  > "Listo, ya le pasé todo a administración. En breves te van a contactar."

- **Fuera de horario**:
  > "Listo, ya le pasé todo a administración. Apenas lo vean te van a contactar."

Reglas:
- **NO** nombrar a una persona específica (sin `{ADMIN_NAME}`).
- **NO** prometer "no vas a repetir nada" — el valor se cumple silencioso (Dossier).
- **NO** usar "experto" en este contexto.

Helper a implementar en F4: `closer.is_business_hours(client_id) -> bool` con `zoneinfo.ZoneInfo("America/Argentina/Buenos_Aires")` leyendo `horario` del yaml del cliente.

## VIP Handoff con Dossier (F4)

Cuando `closer_node` decide `derivar_admin`:

1. Construye un **Dossier estructurado**: cliente (nombre, teléfono, primer contacto), perfil (psicoperfil, confianza, señales), interés (vehículo, presupuesto, techo USD, financia), permuta (vehículo de entrega, datos, cotización express), reserva (si aplica), conversación (turnos, razón handoff, URL Chatwoot), sugerencia heurística para el admin.

2. Envía alerta `vip_handoff` al webhook `AlertasVendedores` de n8n con payload extendido. n8n formatea el mensaje al grupo:

```
🎩 LEAD VIP — {nombre} | {psicoperfil}
📞 {telefono}
🚗 Interés: {vehiculo} ({presupuesto})
🔄 Permuta: {permuta_resumen}
🔖 Reserva activa: {sí/no}
💡 {sugerencia_admin}
🗨️ Último msg: "{ultimo_mensaje}"
🔗 {url_chatwoot}
```

3. Bot responde al cliente con la frase canónica + bot_off + persiste el dossier en Redis (TTL 30d para auditoría).

## Tools nuevas (F3 — pendientes)

### `reservar_unidad(vehiculo, nombre_cliente)`
- Solo PASSION_DRIVE.
- Setea Redis flag `bot:{client_id}:{phone}:reserva` (TTL 48h).
- Dispara alerta `reserva_express` al grupo admin.
- No mueve plata — es reserva conversacional + handoff caliente.

### `cotizar_permuta_express(marca, modelo, anio, km, estado_general)`
- WORK_MACHINE y PASSION_DRIVE.
- Heurística simple por marca/año/km (no tasación real).
- Output al LLM: "Permuta cotizada en rango orientativo U$S X-Y. Admin afina con tasación presencial."
- Dispara alerta `permuta_capturada`.

## Open questions remanentes

- **¿El Dossier llega al grupo o privado a un admin específico?** Hoy las alertas van al grupo (`WHATSAPP_ALERTS_GROUP_ID`). Si querés directo, agregar canal nuevo en `AlertasVendedores`.

## Links

- Spec fuente: `specs/2026-04-25-supreme-sales-swarm.md`
- [[Sesion_2026-04-25_Sales_Swarm_y_LLM_Migration]] — narrativa de la implementación
- [[LLM_Providers]] — qué LLM usa cada componente
- [[Token_Optimization]] — métricas de costos
- [[LangGraph_Bot]] — proyecto padre
- [[../../infra/Agent_Swarm_Architecture]] — visión general del enjambre Kairos
