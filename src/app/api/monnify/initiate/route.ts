import { NextRequest, NextResponse } from 'next/server'
import monnify from '@/services/monnify'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body) return NextResponse.json({ success: false, message: 'Missing payload' }, { status: 400 })
    // Ensure common Monnify fields exist. Map friendly names to Monnify expected keys.
    const contractCode = process.env.MONNIFY_CONTRACT_CODE || process.env.NEXT_PUBLIC_MONNIFY_CONTRACT_CODE || undefined
    const payload: Record<string, unknown> = {
      amount: body.amount,
      currency: body.currency || 'NGN',
      // Monnify expects `paymentDescription` (SDK and API may require this)
      paymentDescription: body.paymentDescription || body.description || 'Payment',
      // Map customer full name/email
      customerFullName: body.fullName || body.customerFullName || body.customerName || '',
      customerEmail: body.email || body.customerEmail || '',
      customerMobile: body.phone || body.customerMobile || '',
      ...(contractCode ? { contractCode } : {}),
      // include any other metadata passed through
      metadata: body.metadata || body.meta || {},
      ...body,
    }

    try {
      const res = await monnify.initiateTransaction(payload)
      return NextResponse.json({ success: true, data: res })
    } catch (err: unknown) {
      // Don't escalate provider errors to a 500 — let the client fallback to SDK flow.
      const error = err as Record<string, unknown>
      console.debug('Monnify initiate provider error (handled):', error?.status ?? error?.message ?? err)
      return NextResponse.json({ success: false, message: 'Provider initiation failed', details: error?.body ?? String(err) })
    }
  } catch (err) {
    console.error('Monnify initiate error:', err)
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
