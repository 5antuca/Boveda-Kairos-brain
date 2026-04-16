---
tags: [trebol, bug, postmortem, evolution-api, prod, whatsapp, zombie]
fecha_volcado: 2026-04-15
fecha_bug: 2026-04-15
componente: trebol-prod-evolution-api (v2.3.7)
status: resuelto — watchdog desplegado
---

# Bug: Evolution API Zombie — WhatsApp deja de recibir mensajes en prod

## Síntoma

Cliente Trebol no recibe mensajes de WhatsApp en producción. Chatwoot no muestra nuevas conversaciones. El bot no responde. Duración del impacto: ~1 hora (desde ~10:00 AR hasta ~11:00 AR).

## Cronología

| Hora (AR) | Evento |
|-----------|--------|
| 06:41 | `uncaughtException` en Evolution API — `UND_ERR_SOCKET: other side closed` en `Fetch.onAborted`. Logging stdout se rompe, pero ChatwootService sigue funcionando. |
| 06:41 – 09:34 | Sistema operativo. Mensajes entrando, Chatwoot y n8n procesando normalmente (IDs 9692–9695 en Chatwoot, ejecuciones 21638–21652 en n8n). |
| ~09:34 | Segunda degradación silenciosa (posible segundo uncaughtException sin loguear). ChatwootService y webhook a n8n dejan de procesar. |
| ~10:00 | Usuario detecta el problema. |
| ~11:00 | Diagnóstico confirmado + `docker restart trebol-prod-evolution-api`. Reconexión exitosa en segundos. |

## Diagnóstico

### Causa raíz — bug en Evolution API v2.3.7

Cuando una llamada HTTP saliente (fetch a Chatwoot o al webhook de n8n) falla con `UND_ERR_SOCKET: other side closed` (el otro lado cierra el socket TCP/TLS mientras Evolution espera respuesta), el error no es capturado por el manejador del servicio y sube como `uncaughtException`.

Node.js tiene un handler global que loguea el error sin crashear el proceso. Pero el `uncaughtException` corrompe el estado interno del pipeline de eventos de Baileys (la librería WS que conecta con WhatsApp). El proceso queda vivo y el health check pasa, pero los eventos `messages.upsert` de WhatsApp dejan de ser procesados.

### Por qué el health check no lo detectó

El healthcheck de Docker solo verifica que el HTTP server responde:
```
wget --spider http://127.0.0.1:8080/
```
Y la API `/instance/connectionState/trebolfinal` devuelve `{"state":"open"}` incluso en estado zombie. El container quedó marcado como `(healthy)` durante toda la hora de outage.

### Por qué ocurrió el socket close

Evolution API hace requests HTTP hacia Chatwoot (`https://trebol.chatwoot.kairosaisolutions.com`) pasando por Traefik. El error sugiere que Traefik o Chatwoot cerraron una conexión idle/expirada mientras Evolution tenía un fetch en vuelo. Combinado con el bug de manejo de errores en v2.3.7, esto disparó el cascade.

## Fix aplicado

```bash
docker restart trebol-prod-evolution-api
```

Reconexión a WhatsApp en ~8 segundos. Session persistida en volumen, sin necesidad de QR.

Nota: al arrancar aparece `bad-request` en `fetchProps/executeInitQueries` (Mode C de Baileys) — no impide la conexión, estado queda `open` con `statusReason: 200`.

## Solución permanente — Watchdog

Script `scripts/watchdog-evolution-prod.sh` deployado con cron cada 5 minutos:

```bash
# Detecta uncaughtException en los últimos 6 minutos y restartea
docker logs trebol-prod-evolution-api --since 6m 2>&1 | grep -q "uncaughtException" \
  && docker restart trebol-prod-evolution-api
```

Log en `/var/log/watchdog-evolution.log`. Impacto máximo de futuros episodios: 5 minutos.

## Lecciones

1. **`uncaughtException` en Node.js no crashea el proceso pero puede zombificarlo.** Un healthcheck que solo verifica el HTTP server no es suficiente para servicios con estado interno complejo (WebSockets, event emitters).

2. **"state: open" en Evolution API no garantiza que esté procesando mensajes.** Es el estado del socket WS hacia WhatsApp, no del pipeline de eventos interno.

3. **El detector más preciso es el síntoma exacto, no una heurística de inactividad.** `grep uncaughtException` en logs es más confiable que "no hubo mensajes en X minutos" (que da falsos positivos en momentos tranquilos del cliente).

4. **Evolution API v2.3.7 tiene este bug.** Evaluar upgrade a versión más reciente en el próximo ciclo de mantenimiento.

## Archivos afectados

- `scripts/watchdog-evolution-prod.sh` — watchdog nuevo
- Crontab root: `*/5 * * * *` entry agregada

## Links

- [[Trebol_Prod_Architecture]]
- [[Docker_Networking_Gotchas]]
- [[reference_evolution_ghost_modes]]
