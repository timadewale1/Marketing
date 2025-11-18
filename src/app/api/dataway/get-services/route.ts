import { NextRequest, NextResponse } from 'next/server'
import { getServices } from '@/lib/dataway'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const slug = url.searchParams.get('slug') || ''
    if (!slug) return NextResponse.json({ ok: false, message: 'slug is required' }, { status: 400 })
    const res = await getServices(slug)
    return NextResponse.json({ ok: true, result: res })
  } catch (err: unknown) {
    console.error('get-services error', err)
    return NextResponse.json({ ok: false, message: 'Internal server error' }, { status: 500 })
  }
}
