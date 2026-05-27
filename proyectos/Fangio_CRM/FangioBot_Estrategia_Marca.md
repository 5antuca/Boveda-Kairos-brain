---
tags: [fangiocrm, fangiobot, estrategia, marca, posicionamiento, roadmap, gtm]
fecha: 2026-05-27
relacionado: [[FangioBot]], [[Roadmap_SaaS_MVP]], [[MVP]], [[Sesion_2026-05-27_Dataset_Media_Orden]]
---

# FangioBot — Estrategia y Marca (norte)

> **Doc vivo en el repo**: `/root/apps/FangioCRM/docs/ESTRATEGIA-FANGIOBOT.md` (versión canónica que se edita con el producto). Acá queda el resumen como norte del proyecto.

## Visión

**Ser EL chatbot de IA para concesionarias de autos y motos de Argentina** — el default obvio, no "uno más".

One-liner: *FangioBot — tu vendedor de WhatsApp que no duerme: responde al toque, califica el lead y te lo pasa listo para cerrar.*

## Marca (queremos una MARCA, no un software)

- **Fangio**: leyenda argentina del automovilismo → confianza, excelencia, argentinidad. Activo de marca corto y memorable. Dominio: **fangiobot.com**.
- **Promesa**: responde como tu mejor vendedor, 24/7, y nunca deja un lead sin atender.
- **Voz**: directa, rioplatense, profesional pero humana, sin relleno (la misma del bot).
- **Qué NO es**: ❌ "reemplazá a tus vendedores" (es "potencialos") · ❌ ChatGPT genérico (es un modelo entrenado para vender autos en AR) · ❌ complejo (se prende en 10 min).
- Visual: grafito + acento verde (emerald), minimal.

## Por qué ganamos (el moat) — en orden de prioridad

1. **Modelo afilado para el rubro (defensa real)** = el **fine-tune** del bot derivador. Cualquiera enchufa ChatGPT a WhatsApp; nadie copia fácil un modelo que clava la conversación de concesionaria AR (califica, deriva, no inventa, permuta/financiación, tono). → ver [[Sesion_2026-05-27_Dataset_Media_Orden]] y `project_fangiobot_finetune_dataset`.
2. **WhatsApp-native** (Evolution): en AR, WhatsApp ES el canal de ventas.
3. **Confianza (derivador + humano en el loop)**: el bot califica y deriva; el dueño no pierde la venta, gana el lead caliente filtrado.
4. **Onboarding de fricción cero**: Excel-drop → schema automático → bot vivo. Para no-técnicos. (ver [[Roadmap_SaaS_MVP]])
5. **Flywheel de datos**: más agencias → más conversaciones → mejor dataset → mejor fine-tune → más difícil de alcanzar. La infra de `bot_examples` ES el motor.

## ICP y negocio
- Concesionarias de **autos y motos** AR, pyme, dueño no técnico, WhatsApp como canal.
- SaaS ~**50.000 ARS/mes**, self-service, MercadoPago. (detalle en [[Roadmap_SaaS_MVP]])

## Roadmap por fases (orden importa)
1. **MOAT** 🔴 en curso — fine-tune del bot.
2. **Cuña** — onboarding self-service de 10 min.
3. **Prueba** — caso El Trébol con números + dashboard de métricas.
4. **Distribución** — landing/demo (✅) + referidos + cámaras/ML + ads.
5. **Escala** — motos a fondo, más canales (IG), analítica.

> El orden es deliberado: sin el #1 sos "uno más"; con el #1 sos "el que de verdad vende".

## Métricas
North star: **agencias activas**. Secundarias: tiempo de respuesta, leads calificados/sem, % derivados que cierran, retención, NPS.
