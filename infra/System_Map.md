# Mapa Integral del Sistema Kairos (End-to-End)

## 1. El Viaje del Mensaje (Flujo Técnico)
Para proponer soluciones integrales, se debe seguir esta trazabilidad:
1. **Capa de Red:** Traefik recibe la petición SSL -> Deriva al contenedor según el subdominio.
2. **Capa de Entrada:** `evolution-api` procesa el webhook de WhatsApp -> Envía a `chatwoot`.
3. **Capa de Control (CRM):** `chatwoot` registra el mensaje -> Dispara webhook a `n8n-main`.
4. **Capa de Inteligencia (N8N):** - `n8n-main` pone el trabajo en la cola de `redis`.
   - `n8n-worker` toma el trabajo -> Ejecuta `trebol.json`.
   - El Agente consulta `mongodb` (Inventario) y `google-sheets` (CRM/Leads).
5. **Capa de Salida:** N8N envía la respuesta de vuelta a Chatwoot via API.

## 2. Dependencias Cruzadas
- **Memoria:** Si el VPS se queda sin RAM, los `n8n-workers` fallan y las respuestas de la IA se cortan o no llegan.
- **Sincronización:** Si `sheetsToMongo.json` falla, la IA dará información de stock desactualizada (respuestas no acertadas).
- **Consistencia de Datos:** El nombre del lead en Chatwoot debe coincidir con el registro en Google Sheets para que la calificación (Lead Scoring) sea efectiva.

## 3. Visión de Solución Integral
Al proponer un cambio, Claude debe evaluar:
- ¿Afecta esto al consumo de RAM del VPS? (Docker)
- ¿Requiere una nueva variable `$env`? (Infraestructura)
- ¿Cómo impacta esto en la experiencia del cliente final en WhatsApp? (Producto)