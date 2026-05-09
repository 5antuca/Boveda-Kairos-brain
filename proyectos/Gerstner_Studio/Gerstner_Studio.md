---
tags: [gerstner-studio, dashboard, moc]
fecha-creacion: 2026-05-09
estado: en-construcción
---

# 🎬 Gerstner Studio

Proyecto paraguas que agrupa las aplicaciones internas y herramientas digitales
asociadas a Gerstner Werks (taller de restauración de autos clásicos).

---

## 🚀 Subproyectos

### Configurador 911 (`studio.gerstnerwerks.com`)
Aplicación interactiva de alta fidelidad para la personalización técnica y estética de Porsche 911/964.

- 📋 **README**: [[Configurador_911/README]]
- 🗺️ **Roadmap**: [[Configurador_911/ROADMAP]]
- 🔧 **Stack**: configurador 3D web
- 📦 **Repo**: [5antuca/gerstnersinger911](https://github.com/5antuca/gerstnersinger911.git)
- 💾 **Código local**: `/Users/5an/Documents/gerstnersinger911/`

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

- **Gerstner Werks (`gerstnerwerks.com`)** — landing institucional del taller (cliente final). Vive en `proyectos/Gerstner_Werks/`.

---

## 📚 Referencias

- [[../Gerstner_Werks/README|Gerstner Werks (taller / cliente final)]]
- [[Configurador_911/README]] — configurador 3D
- [[Drive_Assistant/Drive_Assistant]] — bot interno de Drive
