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
    const anyErr = err as { response?: { status?: number }; code?: string; message?: string }
    if (anyErr?.code === 'ECONNRESET' || anyErr?.message?.includes('socket hang up')) {
      return NextResponse.json(
        { ok: false, message: 'Unable to load available plans right now. Please try again shortly.' },
        { status: 502 }
      )
    }
    const status = anyErr?.response?.status && anyErr.response.status >= 400 ? 502 : 500
    return NextResponse.json(
      { ok: false, message: 'Unable to load available plans right now. Please try again shortly.' },
      { status }
    )
  }
}
