# Reglas de Desarrollo e Implementación (Strict Rules)

## 1. Gestión de Variables de Entorno (CRÍTICO)
- **PROHIBIDO HARDCODEAR:** Nunca escribir URLs, Tokens, Passwords o IDs numéricos directamente en los nodos de N8N.
- **Uso de $env:** Siempre utilizar la sintaxis `$env.NOMBRE_VARIABLE`.
- **Variables Autorizadas:**
    - `$env.CHATWOOT_DOMAIN`, `$env.CHATWOOT_TOKEN`, `$env.CHATWOOT_ACCOUNT_ID`
    - `$env.EVOLUTION_DOMAIN`, `$env.EVOLUTION_API_KEY`
    - `$env.N8N_INTERNAL_URL`, `$env.INTERNAL_WEBHOOK_URL`
    - `$env.WHATSAPP_ALERTS_GROUP_ID`

## 2. Flujo de Despliegue (Deployment)
El ciclo de vida de un cambio en un workflow es:
1. **Editar en Test:** Modificar visualmente en N8N Test.
2. **Exportar JSON:** Descargar el JSON del workflow.
3. **Commit:** Guardar el archivo en la carpeta `/workflows/` del repo.
4. **Deploy Script:** Ejecutar `./scripts/deploy-workflow.sh trebol production nombre_archivo.json`.
   *Nunca editar directamente en Producción sin pasar por el repo.*

## 3. Estándares de Base de Datos
- **Sheets:** No cambiar nombres de columnas (MARCA, MODELO, PRECIO_AL_CONTADO) ya que rompe `sheetsToMongo.json`.
- **MongoDB:** Usado para búsquedas vectoriales del inventario.

## 4. Restricciones de Infraestructura
- No agregar servicios pesados sin consultar RAM disponible (Límite 8GB).
- Backups diarios a R2 (Cloudflare) son obligatorios.