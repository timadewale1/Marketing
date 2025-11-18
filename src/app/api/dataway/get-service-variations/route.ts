import { NextRequest, NextResponse } from 'next/server'
import { getServiceVariations } from '@/lib/dataway'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const service_slug = url.searchParams.get('service_slug') || ''
    if (!service_slug) return NextResponse.json({ ok: false, message: 'service_slug is required' }, { status: 400 })
    const res = await getServiceVariations(service_slug)
    return NextResponse.json({ ok: true, result: res })
  } catch (err: unknown) {
    console.error('get-service-variations error', err)
    return NextResponse.json({ ok: false, message: 'Internal server error' }, { status: 500 })
  }
}
