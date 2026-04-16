// Campos que el modelo Lead.ts debe tener (agregar los que falten)
// Ubicación: src/models/Lead.ts
//
// Si ya tenés el modelo con otros nombres, mapealos en el webhook handler.

import mongoose, { Schema, Document } from 'mongoose'

export interface ILead extends Document {
  tenantId: string        // "el-trebol" — para multi-tenant
  phone: string           // "5491150635028" — sin + ni @s.whatsapp.net
  channel: string         // "whatsapp" (default)
  botActive: boolean      // true = bot activo, false = bot OFF (vendedor tomó control)
  nombre: string | null
  operacion: string | null  // "compra" | "permuta" | "venta" | "admin" | null
  estado: string          // "nuevo" | "calificando" | "derivado"
  turno: number
  createdAt: Date
  updatedAt: Date
}

const LeadSchema = new Schema<ILead>({
  tenantId:   { type: String, required: true, index: true },
  phone:      { type: String, required: true },
  channel:    { type: String, default: 'whatsapp' },
  botActive:  { type: Boolean, default: true },
  nombre:     { type: String, default: null },
  operacion:  { type: String, default: null },
  estado:     { type: String, default: 'nuevo' },
  turno:      { type: Number, default: 0 },
}, { timestamps: true })

// Índice único: una conversación por tenant+phone
LeadSchema.index({ tenantId: 1, phone: 1 }, { unique: true })

export default mongoose.models.Lead || mongoose.model<ILead>('Lead', LeadSchema)


// ── Campos Message.ts ────────────────────────────────────────────────────────
// Si Message.ts no tiene estos campos exactos, agregalos:

export interface IMessage extends Document {
  leadId: mongoose.Types.ObjectId
  text: string
  fromMe: boolean   // false = cliente, true = bot
  timestamp: Date
  createdAt: Date
}

// El modelo Message ya debería existir. Verificar que tenga fromMe y timestamp.
