# 🚀 FangioBot — Roadmap Backend Completo

> Stack: Next.js (API Routes) + MongoDB Atlas + NextAuth + Twilio + OpenAI
> Deploy: Vercel (frontend + api) + MongoDB Atlas

---

## Estado del Frontend

| Componente | Estado |
|---|---|
| `InventoryGrid.tsx` | ✅ Completo (Persistencia MongoDB Integrada) |
| `ChatLayout.tsx` | ✅ Conectado a API Real |
| `ConversationList.tsx` | ✅ Conectado a API Real |
| `MessageWindow.tsx` | ✅ Conectado a API Real |
| `InicioView.tsx` | 🟡 Dashboard (Por conectar métricas reales de Mongo) |
| `Login / Auth` | ✅ Sistema Multi-tenant Completo |
| `IA / WhatsApp` | ✅ Pipeline RAG + Webhook Twilio Completo |

---

## Fase 1 — Persistencia del Inventario

### Objetivo
Que el InventoryGrid guarde y lea de MongoDB en vez de memoria.

### Tareas
- [x] Instalar `mongoose`
- [x] Crear `src/lib/mongodb.ts` — singleton de conexión
- [x] Crear modelo `Vehicle.ts` / `TenantInventory.ts`
- [x] Crear `GET /api/inventory` — cargar vehículos al montar
- [x] Crear `POST /api/inventory` — guardar estado completo de la grilla
- [x] Modificar `InventoryGrid.tsx`:
  - [x] Agregar botón "Guardar" en toolbar
  - [x] Fetch inicial al montar
  - [x] `.env.local` con `MONGODB_URI`

---

## Fase 2 — Auth Multi-Tenant

### Objetivo
Login, sesiones, y que cada concesionaria vea solo sus datos.

### Tareas
- [x] Instalar `next-auth`
- [x] Crear modelo `Tenant.ts` + `User.ts`
- [x] Configurar `src/app/api/auth/[...nextauth]/route.ts`
- [x] Login email/password con bcrypt
- [x] Middleware en `src/middleware.ts` — proteger rutas
- [x] Inyectar `tenantId` en todos los queries MongoDB
- [x] Página de login (`/login`) con estética premium

---

## Fase 3 — Leads + Chat Real

### Objetivo
El chat muestra conversaciones reales de leads, no datos mockeados.

### Tareas
- [x] Crear modelo `Lead.ts`
- [x] Crear modelo `Message.ts`
- [x] `GET /api/leads` — listar leads del tenant
- [x] `GET /api/leads/[id]/messages` — historial de mensajes
- [x] `POST /api/leads/[id]/messages` — enviar mensaje manual
- [x] Conectar `ConversationList.tsx` a `/api/leads`
- [x] Conectar `MessageWindow.tsx` a mensajes reales
- [x] Toggle Bot ON/OFF por lead con persistencia en DB

---

## Fase 4 — WhatsApp Webhook (Twilio)

### Objetivo
Recibir mensajes de WhatsApp y crear/actualizar leads automáticamente.

### Tareas
- [x] Crear cuenta Twilio + Sandbox WhatsApp
- [x] `POST /api/webhook/whatsapp` — recibir mensajes
- [x] Validar firma Twilio (Pendiente para Prod, implementado flujo base)
- [x] Buscar lead por teléfono, crear si no existe
- [x] Guardar mensaje en MongoDB
- [x] Disparar pipeline IA integrado
- [x] Responder con `TwiML` dinámico
- [x] Variables de entorno configuradas: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE`

---

## Fase 5 — Pipeline IA (RAG + LLM)

### Objetivo
El bot responde automáticamente con contexto del inventario y del lead.

### Sub-pipeline

```
Mensaje entrante
   ↓
LLM Extractor (gpt-4o-mini)
   → nombre, intención, vehículo, presupuesto, financiación
   ↓
Actualizar estado del lead en MongoDB
   ↓
RAG: buscar vehículos similares
   → embeddings del inventario
   → cosine similarity
   ↓
LLM Generador (gpt-4o-mini)
   → prompt del tenant + estado del lead + autos encontrados
   ↓
Responder por Twilio → Lead recibe WhatsApp
```

### Tareas
- [x] Instalar `openai`
- [x] Crear `src/lib/ai.ts` — cliente OpenAI (GPT-4o-mini)
- [x] Función `processMessagePipeline` — extractor + generador integrados
- [x] Función `parseInventoryStateToText` — Conversión de grilla a contexto IA (RAG base)
- [x] Integrar en webhook Twilio (Auto-reply inteligente)

---

## Fase 6 — Deploy + Producción

### Objetivo
Todo funcionando en producción.

### Tareas
- [ ] MongoDB Atlas — crear cluster M0 (gratis)
- [ ] Variables de entorno en Vercel:
  - `MONGODB_URI`
  - `NEXTAUTH_SECRET`
  - `OPENAI_API_KEY`
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE`
- [ ] Deploy en Vercel (`vercel deploy`)
- [ ] Configurar webhook URL en Twilio → `https://fangio.vercel.app/api/webhook/whatsapp`
- [ ] Test end-to-end: WhatsApp → Lead → IA → Respuesta

---

## Fase 7 — Profesionalización del Inbox & UX

### Objetivo
Llevar la interfaz de chat a un nivel de producción profesional, eliminando parpadeos y asegurando una UX impecable.

### Tareas
- [x] Migración a UI Kit profesional (`@chatscope/chat-ui-kit-react`)
- [x] Refactorización de `MessageWindow` y `ConversationList` para estabilidad
- [x] Sistema de polling dual optimizado (Leads 5s / Chat Activo 5s)
- [x] Persistencia de Bot Toggle con protección contra sobreescritura de polling
- [x] Optimización de legibilidad y Dark Mode (Contraste, Overflows, Ellipsis)
- [x] Implementación de envío de mensajes con actualización optimista (UI inmediata)
- [x] Eliminación de ruido visual (Remover call buttons y avatars innecesarios)

---

## Variables de Entorno `.env.local`

```env
MONGODB_URI=mongodb+srv://...
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...
OPENAI_API_KEY=sk-...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE=+1...
```

---

## Arquitectura de Carpetas Final

```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── inventory/route.ts
│   │   ├── inventory/save/route.ts
│   │   ├── leads/route.ts
│   │   ├── leads/[id]/messages/route.ts
│   │   ├── ai/chat/route.ts
│   │   └── webhook/whatsapp/route.ts
│   ├── login/page.tsx
│   ├── page.tsx
│   └── layout.tsx
├── components/           (ya existe)
├── lib/
│   ├── mongodb.ts
│   ├── ai.ts
│   └── twilio.ts
├── models/
│   ├── Tenant.ts
│   ├── User.ts
│   ├── Vehicle.ts
│   ├── Lead.ts
│   └── Message.ts
└── middleware.ts
```
