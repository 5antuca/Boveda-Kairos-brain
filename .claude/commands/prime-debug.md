---
description: Cargar contexto para debuggear problemas en producción
---

# Prime — Debug Prod

## Run
docker ps --format "table {{.Names}}\t{{.Status}}" | grep prod
docker logs trebol-prod-n8n --tail 50

## Read
Kairos_Brain/contexto-claude/Architecture_Index.md

## Report
Resumí: containers corriendo, errores recientes en logs, estado general de prod.
