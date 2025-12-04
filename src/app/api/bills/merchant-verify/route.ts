import { NextRequest, NextResponse } from 'next/server'
import * as api from '@/services/vtpass/serviceApi'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = await api.merchantVerify(body)
    return NextResponse.json({ ok: true, result: result })
  } catch (err: unknown) {
    console.error('bills merchant-verify error', err)
    return NextResponse.json({ ok: false, message: 'Internal error' }, { status: 500 })
  }
}
