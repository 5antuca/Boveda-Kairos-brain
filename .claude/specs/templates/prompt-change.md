# Spec: [TÍTULO]

> **Fecha**: YYYY-MM-DD
> **Tipo**: Prompt Change
> **Estado**: 🟡 Draft | ✅ Aprobada | 🚀 Deployed

## Contexto
_¿Qué hace el prompt actual y qué problema tiene?_

## Problema Observado
_Ejemplos concretos de fallos (screenshots, logs, conversaciones)._

## Objetivo
_¿Qué comportamiento esperamos después del cambio?_

## Workflow Afectado
- **Nombre**:
- **ID**:
- **Nodo**: AI Agent → systemMessage

## Cambios al Prompt
| Sección | Cambio | Motivo |
|---------|--------|--------|

### Prompt Completo (nuevo)
```
[prompt completo aquí]
```

## Criterios de Aceptación
| Input del cliente | Respuesta esperada | Respuesta prohibida |
|-------------------|-------------------|---------------------|

## Chat Memory
- [ ] ¿Hay sesiones contaminadas que limpiar?
- [ ] Query: `DELETE FROM n8n_chat_histories WHERE ...`

## Testing
1. Deploy en workflow TEST
2. Simular conversaciones de la tabla de criterios
3. Verificar 3-5 conversaciones reales post-deploy en PROD

---
## DEPLOY LOG
