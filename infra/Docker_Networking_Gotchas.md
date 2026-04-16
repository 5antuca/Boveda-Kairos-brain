---
tags: [memoria, volcado, docker, networking, gotchas, infra]
fecha_volcado: 2026-04-15
---

# Docker Networking — Gotchas y trampas

Cosas de red Docker en el VPS Kairos que ya nos costaron horas. Todo observado en Ubuntu 24.04 con Docker Compose y Traefik.

## ⚠️ NAT Hairpinning — un container no llega al IP público del propio VPS

**Síntoma**: un container (A) intenta hacer HTTP contra un dominio público (`https://otroservicio.midominio.com`) que resuelve a la IP del **mismo VPS** donde A corre. El request se queda colgado hasta timeout (en Axios: `ECONNABORTED`, `timeout of 60000ms exceeded`). Desde el host con `curl` la misma URL responde instantáneo.

**Causa**: se llama **NAT hairpinning** (o NAT loopback). El container resuelve DNS bien (el dominio apunta a la IP pública del VPS, ej. `46.62.235.162`), pero cuando el paquete sale del container hacia esa IP pública:
1. Va por el bridge de Docker → interface de red del host.
2. Sale hacia el router/nube → pega contra la IP pública del VPS (que es la misma).
3. Vuelve a entrar por la interface pública, NAT intenta rutearlo al container target (B) vía Traefik.
4. La tabla de conntrack no puede matchear la conexión de vuelta porque el origen está en el espacio de Docker interno, no en el público.
5. El paquete se pierde en el limbo. Timeout.

Muchos setups de Docker con bridge network + firewall/iptables **no tienen hairpin NAT configurado**, y no es un bug — es configuración default.

**Cómo lo confirmás en 30 segundos**:
```bash
# Desde el host (tiene que responder al toque):
curl -v https://servicio.midominio.com/health

# Desde el container que falla:
docker exec <container-A> sh -c "wget -qO- --timeout=10 https://servicio.midominio.com/health"
# → timeout

# Pero internet general SÍ funciona desde el container:
docker exec <container-A> sh -c "wget -qO- --timeout=5 https://google.com | head -1"
# → responde

# Y DNS resuelve bien:
docker exec <container-A> sh -c "nslookup servicio.midominio.com"
# → resuelve a la IP del VPS
```

Si los tres chequeos dan así → es hairpinning, no DNS, no firewall externo, no SSL.

**Solución**: no llamar al servicio por IP pública. Llamarlo por **red Docker interna**, container-a-container. Pasos:

1. **Verificar que ambos containers compartan una red Docker**:
   ```bash
   docker network ls
   docker inspect <container-A> --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
   docker inspect <container-B> --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
   ```
   Si comparten una (típicamente `traefik_public`), seguir. Si no, agregar A a la red de B con `docker network connect <red> <container-A>` o editando el `docker-compose.yml`.

2. **Reemplazar la URL pública por la interna**:
   - Antes: `https://n8n.fangiocrm.com/webhook/fangiobot-master`
   - Después: `http://fangiocrm-n8n-master:5678/webhook/fangiobot-master`

   El hostname es **el nombre del container target** (no el service name del compose si son stacks distintos). El puerto es el **puerto interno** del servicio, no el expuesto por Traefik.

3. **HTTP, no HTTPS**. La comunicación container-a-container no pasa por Traefik, así que no hay cert. Si el servicio interno solo soporta HTTPS, hay que habilitarlo o configurar un listener HTTP interno.

4. **Probar antes de aplicar**:
   ```bash
   docker exec <container-A> sh -c "wget -qO- http://<container-B>:<puerto>/<path>"
   ```

## Casos donde ya nos pasó

### Caso 1 — Evolution API → n8n FangioCRM (2026-04-15)
- **Evolution**: `trebol-test-evolution-api` intentando postear webhook de mensajes a `https://n8n.fangiocrm.com/webhook/fangiobot-master`.
- **Resultado**: `Tentativa N/10 falhou: Timeout da requisição`, `ECONNABORTED`. El workflow nunca se disparaba aunque Evolution recibía los mensajes de WhatsApp.
- **Fix**: ambos containers compartían `traefik_public`. Cambiar el webhook en Evolution a `http://fangiocrm-n8n-master:5678/webhook/fangiobot-master` resolvió instantáneamente.
- **Comando del fix**:
  ```bash
  curl -sS -X POST "https://test-trebol.evo.kairosaisolutions.com/webhook/set/<instance>" \
    -H "apikey: $EVO_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "webhook": {
        "enabled": true,
        "url": "http://fangiocrm-n8n-master:5678/webhook/fangiobot-master",
        "webhookByEvents": false,
        "events": ["MESSAGES_UPSERT"]
      }
    }'
  ```

## Regla general

Para **cualquier comunicación entre servicios que corren en el mismo VPS**, usar red Docker interna en lugar de la URL pública. Es más rápido (no pasa por Traefik ni TLS), más robusto (no depende de DNS externo ni hairpin), y evita exactamente este problema. Reservar las URLs públicas solo para clientes externos al VPS.

**Checklist antes de hardcodear una URL pública en un service-to-service call**:
- [ ] ¿El caller y el callee están en el mismo VPS? → si sí, considerar red interna
- [ ] ¿Comparten una red Docker? → si sí, usar `http://<container>:<puerto>`
- [ ] ¿No la comparten? → agregarlos a una red común antes de pensar en otras opciones
- [ ] ¿Están en VPSs distintos? → ahí sí usar URL pública, sin problema

## Tips de debug rápido

- **Timeout desde container + curl OK desde host** → casi seguro hairpinning
- **Timeout desde container + curl falla desde host** → no es hairpinning, es servicio caído o firewall
- **Error de DNS desde container** → problema de DNS del daemon Docker, no hairpinning
- **Error SSL desde container** → probablemente cert expirado o cadena rota, no hairpinning
