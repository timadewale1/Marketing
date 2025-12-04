import { NextRequest, NextResponse } from 'next/server'
import * as api from '@/services/vtpass/serviceApi'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const identifier = searchParams.get('identifier') || ''
    if (!identifier) return NextResponse.json({ ok: false, message: 'identifier required' }, { status: 400 })
    const services = await api.getServicesForCategory(identifier)
    return NextResponse.json({ ok: true, result: services })
  } catch (err: unknown) {
    console.error('bills services error', err)
    return NextResponse.json({ ok: false, message: 'Internal error' }, { status: 500 })
  }
}
