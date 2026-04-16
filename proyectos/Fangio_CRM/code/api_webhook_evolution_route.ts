// src/app/api/webhook/evolution/route.ts
//
// Reemplaza el webhook de Twilio. Recibe mensajes de n8n (FangioBot)
// y los persiste en MongoDB para que el chat UI los muestre.
//
// n8n llama este endpoint en dos momentos:
//   1. Al recibir un mensaje del cliente (event: "message_received")
//   2. Al enviar respuesta del bot (event: "bot_response")

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Lead from '@/models/Lead'
import Message from '@/models/Message'

const WEBHOOK_SECRET = process.env.EVOLUTION_WEBHOOK_SECRET

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const secret = req.headers.get('x-webhook-secret')
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await dbConnect()

  const body = await req.json()
  const {
    event,       // "message_received" | "bot_response"
    tenantId,    // "el-trebol"
    phone,       // "5491150635028"
    text,        // texto del mensaje
    fromMe,      // false = cliente, true = bot
    timestamp,
    lead: leadData,  // solo viene en "bot_response" con datos actualizados
  } = body

  if (!tenantId || !phone || !text) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // ── Buscar o crear Lead ─────────────────────────────────────────────────────
  let lead = await Lead.findOne({ tenantId, phone })

  if (!lead) {
    lead = await Lead.create({
      tenantId,
      phone,
      channel: 'whatsapp',
      botActive: true,
      nombre: null,
      operacion: null,
      estado: 'nuevo',
      turno: 0,
    })
  }

  // Actualizar campos del lead si vienen datos no-null del extractor
  if (leadData && event === 'bot_response') {
    const updates: Record<string, unknown> = {}
    if (leadData.nombre   != null) updates.nombre    = leadData.nombre
    if (leadData.operacion != null) updates.operacion = leadData.operacion
    if (leadData.estado   != null) updates.estado    = leadData.estado
    if (leadData.turno    != null) updates.turno     = leadData.turno
    if (Object.keys(updates).length > 0) {
      await Lead.findByIdAndUpdate(lead._id, updates)
    }
  }

  // ── Guardar mensaje ─────────────────────────────────────────────────────────
  await Message.create({
    leadId: lead._id,
    text,
    fromMe: fromMe ?? false,
    timestamp: timestamp ? new Date(timestamp) : new Date(),
  })

  return NextResponse.json({ ok: true })
}
