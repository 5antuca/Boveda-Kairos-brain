# 🚀 MVP SaaS — Chatbot IA para Concesionarias

## 🧠 DESCRIPCIÓN

Aplicación web SaaS que permite a concesionarias:

- Centralizar mensajes (WhatsApp)
- Responder automáticamente con IA
- Consultar inventario de autos
- Calificar leads
- Gestionar clientes (CRM)
- Calcular cuotas de financiación automáticamente

---

# 🎯 OBJETIVO MVP

Validar:

- ¿Las concesionarias usan el sistema?
- ¿La IA responde bien?
- ¿Están dispuestas a pagar?
- ¿El cálculo de cuotas ayuda a cerrar ventas?

---

# 🧩 FUNCIONALIDADES MVP

## 📲 1. Integración WhatsApp

- Conexión vía QR (modo rápido) o API
- Recepción de mensajes
- Envío automático de respuestas

---

## 🤖 2. AI Agent (arquitectura híbrida)

### Flujo:

1. Usuario envía mensaje
2. LLM extrae datos estructurados
3. Se actualiza el estado del cliente
4. Lógica decide acción
5. (si aplica) RAG consulta inventario
6. (si aplica) cálculo de cuotas
7. LLM genera respuesta
8. Se envía respuesta por WhatsApp

---

## 🧠 Estado del cliente (CRM base)

```json
{
  "nombre": null,
  "operacion": null,
  "vehiculo": null,
  "presupuesto": null,
  "financiacion_interes": null,
  "estado_lead": "nuevo"
}
```
