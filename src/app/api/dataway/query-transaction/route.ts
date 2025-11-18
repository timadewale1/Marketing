import { NextRequest, NextResponse } from 'next/server'
import dataway from '@/lib/dataway'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { reference } = body || {}
    if (!reference) return NextResponse.json({ ok: false, message: 'reference is required' }, { status: 400 })

    const res = await dataway.callQuery(String(reference))
    return NextResponse.json({ ok: true, result: res })
  } catch (err: unknown) {
    console.error('Dataway query error', err)
    return NextResponse.json({ ok: false, message: 'Internal server error' }, { status: 500 })
  }
}
