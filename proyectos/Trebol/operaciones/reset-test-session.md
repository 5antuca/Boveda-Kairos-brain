# Reset de sesión en TEST — Trebol v3

Cuando necesitás empezar una conversación desde cero en el entorno de test.

## Comando

```bash
bash scripts/clear-chat-memory.sh 5491150635028
```

Reemplazá `5491150635028` por el número que querés resetear.

## Qué borra

| Storage | Qué | Cómo |
|---------|-----|------|
| Postgres | Historial de chat (`n8n_chat_histories`) | Por `session_id = numero@s.whatsapp.net` |
| Redis v3 | Todas las keys `v3:*` | `conv_state`, `buffer`, `processing`, `pending` |

## Por qué hay que borrar los dos

- **Postgres** guarda el historial de mensajes que el AI Agent usa como contexto (ventana de 5 turnos).
- **Redis** guarda el estado de la conversación (`conv_state`): topic, último vehículo, `asked_name`, `pedido_created`, `conv_over`, etc. Si no se borra, el clasificador y las instrucciones contextuales arrancan con estado viejo.

Si solo borrás Postgres pero no Redis, el bot arranca sin historial pero con estado viejo (por ejemplo, `conv_over=true` o `asked_name=true`), lo que puede causar comportamientos raros.

## Notas

- El script es **solo TEST**. No tiene soporte para prod por diseño.
- Las keys v3 de Redis usan `chat_id` de Chatwoot (no el número de teléfono), por eso el script borra **todas** las keys `v3:*` en lugar de filtrar por número. En test hay típicamente una sola conversación activa a la vez, así que esto es seguro.
- Después del reset, el próximo mensaje del número es tratado como cliente nuevo.
