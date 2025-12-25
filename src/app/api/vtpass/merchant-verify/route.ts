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
    // VTpass returns a code field; only treat as successful when code === '000'
    const code = res?.code ?? res?.data?.code
    const responseDesc = res?.response_description || res?.data?.response_description || res?.content || res?.data?.content
    if (code && String(code) !== '000') {
      return NextResponse.json({ ok: false, message: responseDesc || 'Service not available', result: res }, { status: 400 })
    }
    return NextResponse.json({ ok: true, result: res })
  } catch (err: unknown) {
    console.error('merchant-verify error', err)
    return NextResponse.json({ ok: false, message: 'Internal error' }, { status: 500 })
  }
}
