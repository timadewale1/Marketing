import { NextRequest, NextResponse } from 'next/server'
import dataway from '@/lib/dataway'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      service_slug,
      biller_identifier,
      variation_slug,
      amount,
      reference,
      userId,
    } = body || {}

    if (!service_slug || !biller_identifier || !amount) {
      return NextResponse.json({ ok: false, message: 'service_slug, biller_identifier and amount are required' }, { status: 400 })
    }

    const payload: Record<string, unknown> = { service_slug, biller_identifier, amount, reference }
    if (variation_slug) payload.variation_slug = variation_slug
    if (userId) payload.userId = userId

    const res = await dataway.callVend(payload)
    return NextResponse.json({ ok: true, result: res })
  } catch (err: unknown) {
    console.error('Dataway vend error', err)
    // try to include error message when possible
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}
