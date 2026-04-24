# Agent Swarm Architecture

Este documento define la arquitectura del enjambre cognitivo de Kairos Infrastructure, migrando desde una visión estática de n8n puro hacia una orquestación centralizada en LangGraph (Python).

## 1. Topología del Enjambre

El enjambre se basa en la separación de responsabilidades:
- **Claude Code (Builder):** El orquestador de desarrollo. Escribe el código, configura Docker, rutea y diagnostica. Se comunica con el usuario en terminal.
- **LangGraph (Runtime Cognitivo):** El motor central. Mantiene el estado de las conversaciones, orquesta las llamadas a herramientas y maneja la memoria a largo plazo.
- **n8n (Capa I/O):** Actúa como el sistema nervioso periférico. Maneja webhooks entrantes (Evolution API, Chatwoot, Stripe) y ejecuta sub-rutinas simples, delegando toda decisión compleja a LangGraph vía API REST.

## 2. Mapa de Agentes (Runtime)

| Agente LangGraph | Rol Principal | Herramientas Principales |
| :--- | :--- | :--- |
| **Router Principal** | Clasificar intención del usuario y enrutar al sub-grafo correcto. | Clasificador LLM, RAG básico. |
| **Agente Trebol Venta** | Guiar al cliente hacia la compra, filtrar catálogo por presupuesto. | Buscar Inventario (n8n/Mongo), Calculadora de Cuotas. |
| **Agente Soporte/Admin** | Resolver dudas de infraestructura, pagos, o derivar a humano. | Crear Ticket (Chatwoot), Buscar FAQ. |

## 3. Infraestructura Docker

LangGraph se desplegará como un contenedor dentro de la red interna de Docker (`kairos_network`).
- **Framework:** FastAPI + LangGraph.
- **Memoria:** PostgreSQL (con pgvector) o Redis para checkpointer.
- **Exposición:** `langgraph.kairos-local` (interno para n8n) y protegido por Traefik si sale al exterior.

## 4. Reglas de Desarrollo (Swarm Protocol)

1. **Cognición vs I/O:** Nunca uses n8n para decisiones de IA complejas (ej. "Analiza este texto y si es A haz B, sino C"). Rutea el texto a LangGraph, obtén un JSON estructurado, y usa el `Switch` de n8n solo para rutear basándose en ese JSON.
2. **Memoria Unificada:** Toda la memoria conversacional vive en el StateGraph de LangGraph. n8n no debe usar bases de datos temporales para recordar qué dijo el usuario.
3. **Observabilidad:** Usa LangSmith o Langfuse para trackear las decisiones de LangGraph. Los logs de n8n son solo para ver si el payload llegó.
