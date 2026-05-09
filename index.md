# Wiki Index

## 🏗️ Infraestructura
- [[infra/Roadmap|Roadmap]] - Mejoras activas y backlog del sistema.
- [[infra/VPS_Architecture|VPS_Architecture]] - Detalles del servidor y servicios.
- [[infra/Agent_Swarm_Architecture|Agent_Swarm_Architecture]] - Topología del enjambre LangGraph.

## 🤖 Proyectos

### Fangio CRM (SaaS plataforma + Bot Python)
> El bot LangGraph (Python) es el motor de IA central de FangioCRM. Antes llamado "Trebol Bot" o "LangGraph Bot", ahora está embebido como agente dentro del SaaS.

- [[proyectos/Fangio_CRM/Fangio_CRM|Fangio_CRM]] - Plataforma multi-tenant Next.js + Mongo.
- [[proyectos/Fangio_CRM/Roadmap_Stock_Ingestion_v1|Roadmap_Stock_Ingestion_v1]] - 🆕 XLSX → Mapping → Diff → Embeddings por tenant.
- [[proyectos/Fangio_CRM/Trebol_Bot_Embedded|Trebol_Bot_Embedded]] - Bot Python como motor unificado de respuestas.
- [[proyectos/Fangio_CRM/Arquitectura_Datos|Arquitectura_Datos]] - Modelo de datos MongoDB.
- [[proyectos/Fangio_CRM/Arquitectura_SaaS_Multitenant|Arquitectura_SaaS_Multitenant]] - Topología actual.
- [[proyectos/Fangio_CRM/SheetsToMongo_RAG_Inventario|SheetsToMongo_RAG_Inventario]] - Pipeline inventario Sheets → MongoDB + embeddings RAG.

#### 🧠 Bot LangGraph (Python) — Motor IA
- [[proyectos/Fangio_CRM/LangGraph_Bot/LangGraph_Bot|LangGraph_Bot]] - Proyecto principal, fases 0-11.
- [[proyectos/Fangio_CRM/LangGraph_Bot/Pipeline_Estructura|Pipeline_Estructura]] - Arquitectura actual del pipeline LangGraph.
- [[proyectos/Fangio_CRM/LangGraph_Bot/Operar_Bot|Operar_Bot]] - Runbook operativo.
- [[proyectos/Fangio_CRM/LangGraph_Bot/Prod_Deploy|Prod_Deploy]] - Cutover prod 2026-04-18.
- [[proyectos/Fangio_CRM/LangGraph_Bot/Onboarding_Nuevo_Cliente|Onboarding_Nuevo_Cliente]] - Agregar nuevo cliente/tenant.
- [[proyectos/Fangio_CRM/LangGraph_Bot/Vision_Classifier|Vision_Classifier]] - Clasificación de imágenes WhatsApp con gpt-4.1-mini.
- [[proyectos/Fangio_CRM/LangGraph_Bot/Audio_Mode_Roadmap|Audio_Mode_Roadmap]] - Roadmap TTS/Audio (ElevenLabs).
- [[proyectos/Fangio_CRM/LangGraph_Bot/Observabilidad_Langfuse|Observabilidad_Langfuse]] - Debugging con traces Langfuse.
- [[proyectos/Fangio_CRM/LangGraph_Bot/Conversaciones_Ideales|Conversaciones_Ideales]] - Golden set de conversaciones de referencia.

#### 🗃️ Referencia (FangioBot n8n — deprecando)
- [[proyectos/Fangio_CRM/FangioBot_v2_Architecture|FangioBot_v2_Architecture]] - Bot n8n (siendo reemplazado por bot Python).

### Gerstner Werks (Landing institucional)
- [[proyectos/Gerstner_Werks/README|README]] - Overview del taller / cliente final.

### Gerstner Studio (Paraguas de herramientas internas)
- [[proyectos/Gerstner_Studio/Gerstner_Studio|Gerstner Studio (dashboard)]] - Mapa del paraguas.
- [[proyectos/Gerstner_Studio/Configurador_911/ROADMAP|ROADMAP Configurador 911]] - Estado y fases del configurador 3D.
- [[proyectos/Gerstner_Studio/Drive_Assistant/Drive_Assistant|Drive Assistant]] - Bot LangGraph para buscar fotos del taller en Drive (`gerstnerwerks.ai`).

## 📄 General
- [[Bienvenido]]
- [[sobre-mi]]
- [[Instrucciones Generales]]
- [[CLAUDE]]
