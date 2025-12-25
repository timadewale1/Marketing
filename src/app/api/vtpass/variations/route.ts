import { NextRequest, NextResponse } from 'next/server'
import * as api from '@/services/vtpass/serviceApi'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const serviceID = searchParams.get('serviceID') || ''
    if (!serviceID) return NextResponse.json({ ok: false, message: 'serviceID required' }, { status: 400 })
    const vars = await api.getVariations(serviceID)
    return NextResponse.json({ ok: true, result: vars })
  } catch (err: unknown) {
    console.error('vtpass variations error', err)
    return NextResponse.json({ ok: false, message: 'Internal error' }, { status: 500 })
  }
}
