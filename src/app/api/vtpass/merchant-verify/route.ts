import { NextRequest, NextResponse } from 'next/server'
import * as api from '@/services/vtpass/serviceApi'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { billersCode, serviceID, type } = body || {}
    if (!billersCode || !serviceID) return NextResponse.json({ ok: false, message: 'billersCode and serviceID required' }, { status: 400 })
    const payload: Record<string, unknown> = { billersCode, serviceID }
    if (type) payload.type = type
    const res = await api.merchantVerify(payload)
    return NextResponse.json({ ok: true, result: res })
  } catch (err: unknown) {
    console.error('merchant-verify error', err)
    return NextResponse.json({ ok: false, message: 'Internal error' }, { status: 500 })
  }
}
