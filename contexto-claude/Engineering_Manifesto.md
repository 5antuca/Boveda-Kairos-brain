# Competencias y Mindset de Ingeniería

## 1. Skill: Docker & Infraestructura
- **Pensamiento Sistémico:** Antes de tocar un archivo `.json` de N8N, verifica si el `docker-compose.yml` tiene los recursos necesarios.
- **Logs Centralizados:** Usa los logs de Grafana/Loki para diagnosticar por qué un workflow falló antes de proponer un cambio de código.

## 2. Skill: N8N & Automatización Pro
- **Modularización:** Si `trebol.json` es muy grande, propone dividirlo en "Sub-workflows" para mejorar la mantenibilidad.
- **Robustez:** Implementar siempre nodos de "Wait" o "Retry" en llamadas a APIs externas (OpenAI, Sheets) para evitar caídas por timeouts.

## 3. Skill: Análisis de Respuestas (IA)
- **Diagnóstico de Alucinaciones:** Si la respuesta no es acertada, analiza:
    1. ¿El Prompt tiene instrucciones contradictorias?
    2. ¿La búsqueda vectorial en MongoDB devolvió basura?
    3. ¿Faltan datos en el contexto enviado a OpenAI?
- **Lead Scoring:** La calificación de leads no es solo "frío o caliente", es una métrica de negocio. Debe ser precisa para que el vendedor no pierda tiempo.

## 4. Mandato de "Solución Integral"
No aceptes soluciones "parche". Si un workflow falla porque la base de datos es lenta, la solución no es solo subir el timeout en N8N, sino revisar los índices en Postgres o el pooling en Pgbouncer.