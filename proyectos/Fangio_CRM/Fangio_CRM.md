# 🏎️ Fangio CRM

**Fangio CRM** es una plataforma de gestión de ventas automotrices de alto rendimiento, diseñada con una estética minimalista, profesional y oscura. El sistema centraliza la gestión de inventario y la comunicación con clientes en una interfaz fluida y eficiente, rindiendo homenaje a la precisión y velocidad de Juan Manuel Fangio.

---

## 📁 Recursos del Proyecto
- **📂 Código Fuente (Local):** [Abrir Carpeta FangioCRM](file:///Users/5an/Documents/FangioCRM)
- **🌐 Repositorio GitHub:** [5antuca/FangioCRM](https://github.com/5antuca/FangioCRM)

---

## 🛠️ Cómo iniciar el proyecto en Local

Para cargar la aplicación en su estado actual, sigue estos pasos:

1. **Instalación:** Abre tu terminal en la carpeta del proyecto y ejecuta: `npm install`
2. **Ejecución:** Inicia el servidor de desarrollo: `npm run dev`
3. **Acceso:** Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

---

## 🚀 Logros e Implementaciones (Abril 2026)

### ✅ Grilla de Inventario (InventoryGrid)
- **Cabecera Fija (Sticky):** La primera fila de la tabla ahora se mantiene anclada en la parte superior al hacer scroll vertical.
- **Resaltado Persistente:** Al hacer clic en una celda, toda la fila se resalta hasta que se confirma la edición.

### ✅ Identidad Visual & Branding
- **Logo Sidebar:** Versión optimizada con CSS para transparencia perfecta sobre fondo oscuro.
- **Favicon Global:** Configurado con el emoji del auto (`🏎️`).
- **Home Minimalista:** Estética sobria sin distracciones en la cabecera principal.

### ✅ Interfaz de Chat (CustomerPanel)
- **Comunicación Limpia:** Eliminación de ruido visual y botones innecesarios.
- **Automatización de Canal:** Sufijo `(WPP)` añadido automáticamente a los nombres de contacto.

### ✅ Fase 1 Completada: Analíticas y Setup WA Zero-Touch (Abril 2026)
- **Dashboard Enterprise:** Gráficos con `recharts` visualizando conversiones, rendimiento por canal y crecimiento de leads. Solucionado el "flicker" de animaciones en React.
- **WhatsApp Modal:** Migrado el QR a un layout tipo *Glassmorphism* emergente (modal_blur). 
- **Aprovisionamiento Automático:** La API de Evolution se crea silenciosamente en segundo plano usando webhooks asíncronos cuando un nuevo tenant se registra, mejorando radicalmente el UX.
- **Dominio Principal:** Redirección 301 forzada a nivel de servidor de `*.vercel.app` para utilizar únicamente la marca `fangiocrm.com`.

### ✅ Fase 2 Completada: Despliegue de Infraestructura Multitenant (N8N)
- **Topología Aislada:** Separación total de "Trebol" creando el contenedor `fangiocrm-infra`.
- **Motor Multitenant Stateless:** n8n configurado como enrutador lógico central (Webhook Maestro) que delega la memoria y persistencia a MongoDB y Redis, habilitando la escala paralela para 100+ concesionarias.
- **Proxy Traefik & SSL:** Desactivación de puertos expuestos e integración de Let's Encrypt mediante Cloudflare DNS-Only.

### 🔄 Fase 3 En Progreso: FangioBot v2 (2026-04-15)
- **Tenant activo:** `el-trebol` en MongoDB + Evolution API conectada (`connectionStatus: open`)
- **Infraestructura lista:** webhook Evolution → n8n operativo con URL interna Docker
- **v1 descartada:** bugs estructurales en pipeline de contexto detectados en testing real
- **v2 en diseño:** Two-LLM pipeline (Extractor nano + AI Agent), sin guardias, state machine en system prompt
- Ver diseño completo: [[FangioBot_v2_Architecture]]

---
*Nota: Esta es la documentación estratégica en Kairos Brain. El código fuente vive fuera de esta bóveda.*
