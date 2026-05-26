# 🏎️ FangioBot

**FangioBot** es una plataforma de gestión de ventas automotrices de alto rendimiento, diseñada con una estética minimalista, profesional y oscura. El sistema centraliza la gestión de inventario y la comunicación con clientes en una interfaz fluida y eficiente, rindiendo homenaje a la precisión y velocidad de Juan Manuel Fangio.

---

## 📁 Recursos del Proyecto
- **📂 Código Fuente (Local):** [Abrir Carpeta FangioBot](file:///Users/5an/Documents/FangioCRM)
- **🌐 Repositorio GitHub:** [5antuca/FangioCRM](https://github.com/5antuca/FangioCRM)
- **📋 MVP:** [[MVP]] — definición inicial y funcionalidades objetivo del SaaS.
- **🗺️ Roadmap SaaS MVP:** [[Roadmap_SaaS_MVP]] — fases F0–F6, estado actual (F1 completa), decisiones de arquitectura y economía.
- **🔑 Credenciales:** [[Keys]] — APIs, MongoDB, evolution. Confidencial.
- **⚙️ Variables de Entorno:** [[code/env_vars]] — vars de entorno para Vercel y VPS.

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
- **Dominio Principal:** Redirección 301 forzada a nivel de servidor de `*.vercel.app` para utilizar únicamente la marca `fangiobot.com`.

### ✅ Fase 3 Completada: Professional Performance Chat (Abril 2026)
- **Mapping de WhatsApp Real:** Priorización de `pushName` y limpieza de metadatos en la sidebar (`lastMessageContent` sin prefijos).
- **Estética Dark Premium:** Overrides globales en CSS para eliminar todos los fondos claros heredados de la librería `@chatscope`, logrando una interfaz 100% negra y minimalista. Se implementó una técnica de centrado absoluto para el placeholder de chat vacío, garantizando perfecta alineación visual.
- **Flujo Real-Time & Data Join:** Sincronización optimizada entre n8n y el dashboard. Se implementó una agregación de MongoDB (`$lookup`) en el backend que garantiza que el sidebar siempre muestre el último mensaje real incluso si la tabla de leads no se actualizó, eliminando el fallback "Chat iniciado".
- **Legibilidad & Contraste:** Corrección de visibilidad en perfiles de cliente (avatares con texto blanco) y optimización de jerarquía tipográfica. Prioratización absoluta de `pushName` de WhatsApp en el mapeo de nombres.

### 🔄 Fase 3 En Progreso: FangioBot v2 (2026-04-15)
- **Tenant activo:** `el-trebol` en MongoDB + Evolution API conectada (`connectionStatus: open`)
- **Infraestructura lista:** webhook Evolution → n8n operativo con URL interna Docker
- **v1 descartada:** bugs estructurales en pipeline de contexto detectados en testing real
- **v2 en diseño:** Two-LLM pipeline (Extractor nano + AI Agent), sin guardias, state machine en system prompt
- Ver diseño completo: [[FangioBot_v2_Architecture]]

---

### 🆕 Fase 4 — Stock Ingestion Multi-Tenant + Trebol Bot Embedded (2026-05-04)
Cambio estratégico mayor: FangioBot se vuelve la plataforma SaaS principal. Cada concesionaria sube su XLSX de inventario y obtiene un bot WhatsApp configurable.

- **Pipeline de ingesta** XLSX → Mapping UI → Diff incremental → Embeddings → Mongo Atlas Vector Search por tenant. Mejora sobre [[../Trebol/SheetsToMongo_RAG_Inventario|SheetsToMongo v2]] (sin AppScript, fingerprint hash determinístico, audit trail).
- **Aislamiento estricto**: una colección Mongo por tenant (`inventory_{tenantId}`).
- **Trebol Bot embebido**: el bot Python (LangGraph) reemplaza el pipeline n8n de FangioBot v2 como motor unificado para todos los tenants. Cada tenant tiene sección de configuración (nombre concesionaria, vendedor del bot, tono, financiación).
- 📋 **Diseño completo**: [[Roadmap_Stock_Ingestion_v1]] · [[Trebol_Bot_Embedded]]
- ⏳ Pendiente decisiones D1-D6 antes de Sprint 0.

#### ✅ Ingesta de Stock implementada (2026-05-23)
Pipeline de ingesta **LIVE**. Módulo `bot-service/trebol_bot/ingest/` lee el `gridState` que FangioBot guarda en `fangio_crm.tenantinventories`, lo transforma (precio→USD con blue en vivo, filtra señados/no-en-agencia), clasifica con LLM (8 campos) y reembede a `RAGtrebol.propiedades-test`. Endpoints `POST /ingest/reimport-tenant` (manual) y `POST /webhook/inventory-changed` (lo llamará FangioBot al guardar). Primer reimport: 54 autos del Trébol. Detalle en [[Next_Session_Checklist]] (banner EJECUTADO). **Pendiente**: trigger live en el frontend de FangioBot + commit.

---
*Nota: Esta es la documentación estratégica en Kairos Brain. El código fuente vive fuera de esta bóveda.*
