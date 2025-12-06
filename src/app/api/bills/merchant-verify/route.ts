import { NextRequest, NextResponse } from 'next/server'
import * as api from '@/services/vtpass/serviceApi'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = await api.merchantVerify(body)
    return NextResponse.json({ ok: true, result: result })
  } catch (err: unknown) {
    console.error('bills merchant-verify error', err)
    // If the error is an AxiosError with response, forward useful status/message
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyErr = err as any
    if (anyErr?.response) {
      const status = anyErr.response.status || 500
      const message = anyErr.response.data || anyErr.message || 'VTpass error'
      return NextResponse.json({ ok: false, message }, { status })
    }
    return NextResponse.json({ ok: false, message: 'Internal error' }, { status: 500 })
  }
}
