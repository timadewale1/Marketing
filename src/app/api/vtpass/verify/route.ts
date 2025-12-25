import { NextRequest, NextResponse } from 'next/server'
import vtpassClient from '@/services/vtpass/client'

export async function POST(req: NextRequest) {
  try {
    const { request_id } = await req.json()
    if (!request_id) return NextResponse.json({ ok: false, message: 'request_id required' }, { status: 400 })

    // VTpass may provide a query endpoint; here we attempt to query by reference via /pay/verify or similar
    // We'll call a generic verification endpoint if available
    try {
      const res = await vtpassClient.post('/verify', { request_id })
      return NextResponse.json({ ok: true, result: res.data })
    } catch (e) {
      return NextResponse.json({ ok: false, message: 'VTpass verify failed', error: String(e) }, { status: 502 })
    }
  } catch (err: unknown) {
    console.error('VTpass verify error', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}
