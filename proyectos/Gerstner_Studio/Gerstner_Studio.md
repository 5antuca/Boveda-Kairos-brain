---
tags: [gerstner-studio, dashboard, moc]
fecha-creacion: 2026-05-09
estado: en-construcción
---

# 🎬 Gerstner Studio

Proyecto paraguas que agrupa las aplicaciones internas y herramientas digitales
asociadas a Gerstner Werks (taller de restauración de autos clásicos).

> **Nota**: existe también `proyectos/Gerstner_Werks/Gerstner_Studio/` (el
> configurador 3D `studio.gerstnerwerks.com`). Ese subfolder y este pueden
> convivir, fusionarse o reorganizarse — pendiente decisión del usuario.

---

## 🚀 Subproyectos

### Drive Assistant (`gerstnerwerks.ai`) — 🆕 EN DISEÑO
Chatbot interno para el equipo del taller que busca y muestra fotos/videos de
proyectos almacenados en Google Drive (~20 GB) usando lenguaje natural.

- 📋 **Dashboard**: [[Drive_Assistant/Drive_Assistant]]
- 📝 **Decisiones pendientes**: [[Drive_Assistant/Decisiones_Pendientes]]
- 📜 **Spec original**: [[Drive_Assistant/Spec_Original]]
- 🔧 **Stack**: Python (FastAPI + LangGraph) + React (Vite) + MongoDB + OpenAI + Google Drive API (OAuth user)
- 🌐 **Dominio previsto**: `gerstnerwerks.ai` (a registrar)
- 📊 **Estado** (2026-05-09): spec recibido + decisiones tomadas. Pendiente: dev local Fase 1.

---

## 🔗 Relación con otros proyectos

- **Gerstner Werks (`gerstnerwerks.com`)** — landing institucional, repo `gerstnerwerks5`. Vive en `proyectos/Gerstner_Werks/`.
- **Configurador 3D (`studio.gerstnerwerks.com`)** — repo `gerstnersinger911`. Vive en `proyectos/Gerstner_Werks/Gerstner_Studio/` (folder con nombre que duplica este — pendiente reorganizar).

---

## 📚 Referencias

- [[../Gerstner_Werks/README|Gerstner Werks (proyecto paraguas histórico)]]
- [[Drive_Assistant/Drive_Assistant]] — primer subproyecto activo de Gerstner Studio
