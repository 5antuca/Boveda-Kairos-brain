// src/app/api/leads/[id]/bot/route.ts
//
// Toggle bot ON/OFF para una conversación.
// 1. Actualiza botActive en MongoDB
// 2. Notifica al webhook n8n → que setea/borra la key Redis en el worker
//
// PATCH /api/leads/:id/bot  { "active": false }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/mongodb'
import Lead from '@/models/Lead'

const N8N_URL    = process.env.N8N_INTERNAL_URL    // "https://n8n.fangiocrm.com"
const N8N_SECRET = process.env.EVOLUTION_WEBHOOK_SECRET

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await dbConnect()

  const { active } = await req.json() as { active: boolean }
  const tenantId = (session.user as { tenantId?: string }).tenantId

  const lead = await Lead.findOne({ _id: params.id, tenantId })
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  // 1. Actualizar MongoDB
  await Lead.findByIdAndUpdate(params.id, { botActive: active })

  // 2. Notificar n8n → Redis
  if (N8N_URL) {
    try {
      await fetch(`${N8N_URL}/webhook/bot-toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(N8N_SECRET ? { 'x-webhook-secret': N8N_SECRET } : {}),
        },
        body: JSON.stringify({
          instance: lead.tenantId,
          phone: lead.phone,
          bot_off: !active,
        }),
        // No esperar más de 3s — no bloquear la UI
        signal: AbortSignal.timeout(3000),
      })
    } catch {
      // n8n puede estar caído. MongoDB ya fue actualizado → el bot se reactiva
      // en el próximo restart de n8n cuando lee el flag desde FangioCRM.
      console.error('[bot-toggle] n8n unreachable, MongoDB updated anyway')
    }
  }

  return NextResponse.json({ ok: true, botActive: active })
}
