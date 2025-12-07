import { NextRequest, NextResponse } from 'next/server'
import * as api from '@/services/vtpass/serviceApi'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const serviceID = searchParams.get('serviceID') || ''
    if (!serviceID) return NextResponse.json({ ok: false, message: 'serviceID required' }, { status: 400 })
    const variations = await api.getVariations(serviceID)
    return NextResponse.json({ ok: true, result: variations })
  } catch (err: unknown) {
    console.error('bills variations error', err)
    const anyErr = err as { response?: { status?: number; data?: string }; code?: string; message?: string }
    if (anyErr?.response) {
      const status = anyErr.response.status || 500
      const message = anyErr.response.data || anyErr.message || 'VTpass error'
      return NextResponse.json({ ok: false, message }, { status })
    }
    // network errors (ECONNRESET) -> return 502 with helpful message
    if (anyErr?.code === 'ECONNRESET' || anyErr?.message?.includes('socket hang up')) {
      return NextResponse.json({ ok: false, message: 'Upstream service connection error' }, { status: 502 })
    }
    return NextResponse.json({ ok: false, message: 'Internal error' }, { status: 500 })
  }
}
