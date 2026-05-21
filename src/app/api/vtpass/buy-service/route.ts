import { NextRequest, NextResponse } from 'next/server'
import vtpassClient from '@/services/vtpass/client'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { SERVICE_CHARGE, generateRequestId } from '@/services/vtpass/utils'
import { getBillsCommission, getBillsServiceLabel } from '@/lib/bills-commission'
import { resolveBillsPurchaseActor } from '@/lib/bills-admin-alerts'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { request_id, serviceID, amount, phone, paystackReference, userId, metadata, variation_code, billersCode, subscription_type, quantity } = body || {}

    if (!serviceID) return NextResponse.json({ ok: false, message: 'serviceID is required' }, { status: 400 })

    // Determine request_id (ensure VTpass 12-char prefix format). Prefer client-sent value but generate if missing.
    const reqId = request_id || generateRequestId(String(Math.floor(Math.random() * 1000000)))

    // Build payload for VTpass /pay (supporting various service-specific fields per docs)
    const payload: Record<string, unknown> = { request_id: reqId, serviceID }
    if (variation_code) payload.variation_code = variation_code
    if (billersCode) payload.billersCode = billersCode
    if (subscription_type) payload.subscription_type = subscription_type
    if (quantity) payload.quantity = quantity
    if (phone) payload.phone = phone
    if (amount) payload.amount = String(amount)
    if (metadata) payload.metadata = metadata

    // call VTpass
    const vtRes = await vtpassClient.post('/pay', payload)

    // compute paidAmount and markup for admin accounting
    const recordedAmount = Number(amount ?? (vtRes?.data?.amount ?? vtRes?.data?.content?.amount ?? 0))
    const paidAmount = Number(recordedAmount || 0) + SERVICE_CHARGE
    const markup = SERVICE_CHARGE

    // Save a record in Firestore for admin reporting
    try {
      const { dbAdmin } = await initFirebaseAdmin()
      if (dbAdmin) {
        const actor = await resolveBillsPurchaseActor(userId || null)
        const commission = getBillsCommission(String(serviceID), paidAmount, getBillsServiceLabel(String(serviceID)))
        await dbAdmin.collection('vtpassTransactions').add({
          request_id: reqId,
          serviceID,
          serviceLabel: commission.label,
          variation_code: variation_code || null,
          billersCode: billersCode || null,
          amount: recordedAmount || null,
          paidAmount,
          markup,
          profit: commission.profit,
          profitRate: commission.rate,
          commissionCap: commission.cap ?? null,
          phone: phone || null,
          paystackReference: paystackReference || null,
          provider: null,
          paymentChannel: 'direct',
          actorUserId: userId || null,
          actorName: actor.name,
          actorNameLower: actor.name.toLowerCase(),
          actorRole: actor.roleLabel,
          actorPath: actor.adminPath,
          serviceIDLower: String(serviceID || '').toLowerCase(),
          reference: String(paystackReference || reqId),
          referenceLower: String(paystackReference || reqId).toLowerCase(),
          searchKey: [actor.name, actor.roleLabel, serviceID, paystackReference, reqId].filter(Boolean).join(' ').toLowerCase(),
          response: vtRes.data || null,
          userId: userId || null,
          createdAt: new Date().toISOString(),
        })
      }
    } catch (e) {
      console.warn('Failed to save VTpass transaction', e)
    }

    return NextResponse.json({ ok: true, result: vtRes.data })
  } catch (err: unknown) {
    console.error('VTpass buy-service error', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}
