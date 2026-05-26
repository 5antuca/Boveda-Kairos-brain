# Arquitectura SaaS: FangioBot & N8N Multitenant

*Este documento describe la topología de la infraestructura híbrida (Vercel + VPS Independiente) diseñada para que FangioBot opere como un SaaS escalable para múltiples concesionarias, previniendo cuellos de botella.*

---

## 1. Topología del Servidor (VPS)

Para evitar que una caída de `Trebol` afecte a `FangioBot` y permitir escalabilidad pura, se creó un ecosistema aislado en el Servidor Virtual.

- **Ruta de Infraestructura:** `/root/apps/fangiocrm-infra`
- **Dominio Asociado:** `https://n8n.fangiocrm.com` (Redirección segura vía Traefik en red `traefik_public`).
- **Seguridad / DNS:** El DNS está alojado en Cloudflare. Está configurado como "DNS Only" (nube gris) apuntando a la IPv4 pública (`46.62.235.162`) para que Traefik pueda certificar libremente con Let's Encrypt.
- **Autenticación (Basic Auth Frontal):** `santiagogerstner14@gmail.com` / `Santiswag1*`

### Ecosistema Docker (n8n escalar en Queue)
El `docker-compose.yml` despliega 4 contenedores:
1. **master (`fangiocrm-n8n-master`)**: Expuesto hacia la web por el puerto interno 5678 (no está expuesto en Host, solo a través de Traefik). Su única tarea es rutear el Webhook maestro de Evolution API.
2. **redis (`fangiocrm-n8n-redis`)**: Base central de colas temporal.
3. **worker (`fangiocrm-n8n-worker-1`)**: Los mineros encargados de procesar la Inteligencia Artificial al recibir la órden en cola. Si hay pico de clientes, simplemente se escalan levantando `n8n-worker-2`, `n8n-worker-3`.
4. **db (`fangiocrm-n8n-db`)**: Mantenimiento de credenciales Postgres.

---

## 2. Topología de Vercel (Next.js)

FangioBot está programado en Next.js alojado en Vercel. Su dominio forzado 301 es `fangiobot.com`.
Sirve como el "**Cerebro Verdadero / Fuente de la Verdad**". En vez de guardar variables secretas de cada concesionaria en N8N, guardamos todo en **MongoDB**, y N8N simplemente le consulta al código a través de los Custom Endpoints construidos:

### Endpoints Vitales de RAG y Control
1. **`GET /api/agent/context/?instance={instanceName}`** 
   - **Propósito:** Actúa como memoria externa (Retrieval-Augmented Generation).
   - **Respuesta JSON:** Entrega al instante el Inventario de Vehículos, las Tasas de Financiación, el Tono del Prompt, y Redes Sociales de esa concesionaria específica usando el nombre de su instancia.
   - **Uso para IAs:** El workflow de n8n DEBE arrancar llamando a este endpoint apenas recibe un mensaje para inyectarle las reglas al Agente IA correspondientes a esa agencia.

2. **`POST /api/evolution/webhook/`** 
   - **Propósito (Anti-Zombies 🧟‍♂️):** Receptor asincrónico para Evolution API.
   - **Mecánica:** En el SaaS de escala, el polling (`GET` de estado cada 10 seg) destruiría la CPU. Esta API recibe Push Notifications reactivas nativas de Evolution API. Si la conexión de WhatsApp de un cliente se desconecta (`event: connection.update`, `state: close`), este endpoint lo intercepta inmediatamente y anula las acciones aislando la sesión para evitar que el bot mande mensajes a la nada y ahogue la memoria.

---

## 3. Guía Funcional (Para Construir el Workflow Multitenant)

Dado que un único `Canvas` en n8n administrará potencialmente a 100 concesionarias de vehículos diferentes simultáneamente, el flujo algorítmico **no debe mantener "estado" ni sub-reglas quemadas** (*harcoded*). Debería configurarse de esta manera:

1. **Trigger de Recepción:**
   - Todo mensaje cae en un Webhook de inicio configurado en n8n maestro.
2. **Identificación de Cliente:**
   - Del JSON recibido, el nodo inicial debe extraer la propiedad identificativa: `instance`. Ejemplo: `"fangio-cordoba"`.
3. **Fetching de Variables:**
   - Nodo HTTP. Método: `GET`. URL: `https://fangiobot.com/api/agent/context?instance={{$json.instance}}`.
4. **Agente IA (LangChain / OpenAI Node):**
   - El *System Prompt* del agente es inyectado desde la respuesta del nodo HTTP `InstruccionesVenta`, al igual que el Catálogo Automotor.
5. **Trigger de Envío:**
   - La contestación del bot llega al nodo HTTP final (Evolution API - SendText/Audio). La URL variable de envío a instanciar será: `https://test-trebol.evo.kairosaisolutions.com/message/sendText/{{$json.instance}}`.

Esta arquitectura es completamente horizontal. Si agregás a la concesionaria #101 desde Vercel, funcionará sin tener que modificar una sola caja en n8n ni reiniciar servidores.
