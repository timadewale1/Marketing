import { NextRequest, NextResponse } from 'next/server'
import vtpassClient from '@/services/vtpass/client'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { SERVICE_CHARGE, generateRequestId } from '@/services/vtpass/utils'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { request_id, serviceID, amount, phone, paystackReference, userId, metadata, variation_code, billersCode, subscription_type, quantity } = body || {}

    if (!serviceID) return NextResponse.json({ ok: false, message: 'serviceID is required' }, { status: 400 })

    const reqId = request_id || generateRequestId(String(Math.floor(Math.random() * 1000000)))

    const payload: Record<string, unknown> = { request_id: reqId, serviceID }
    if (variation_code) payload.variation_code = variation_code
    if (billersCode) payload.billersCode = billersCode
    if (subscription_type) payload.subscription_type = subscription_type
    if (quantity) payload.quantity = quantity
    if (phone) payload.phone = phone
    if (amount) payload.amount = String(amount)
    if (metadata) payload.metadata = metadata

    const vtRes = await vtpassClient.post('/pay', payload)

    const recordedAmount = Number(amount ?? (vtRes?.data?.amount ?? vtRes?.data?.content?.amount ?? 0))
    const paidAmount = Number(recordedAmount || 0) + SERVICE_CHARGE
    const markup = SERVICE_CHARGE

    try {
      const { dbAdmin } = await initFirebaseAdmin()
      if (dbAdmin) {
        await dbAdmin.collection('vtpassTransactions').add({
          request_id: reqId,
          serviceID,
          variation_code: variation_code || null,
          billersCode: billersCode || null,
          amount: recordedAmount || null,
          paidAmount,
          markup,
          phone: phone || null,
          paystackReference: paystackReference || null,
          response: vtRes.data || null,
          userId: userId || null,
          createdAt: new Date().toISOString(),
        })
      }
    } catch (e) {
      console.warn('Failed to save transaction', e)
    }

    return NextResponse.json({ ok: true, result: vtRes.data })
  } catch (err: unknown) {
    console.error('bills buy-service error', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}
