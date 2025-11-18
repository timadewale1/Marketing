import { NextRequest, NextResponse } from 'next/server'
import { validateBiller } from '@/lib/dataway'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { service_slug, biller_identifier, variation_slug } = body || {}
    if (!service_slug || !biller_identifier) return NextResponse.json({ ok: false, message: 'service_slug and biller_identifier are required' }, { status: 400 })
    const res = await validateBiller({ service_slug, biller_identifier, variation_slug })
    return NextResponse.json({ ok: true, result: res })
  } catch (err: unknown) {
    console.error('validate-biller error', err)
    return NextResponse.json({ ok: false, message: 'Internal server error' }, { status: 500 })
  }
}
