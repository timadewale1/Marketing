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
    return NextResponse.json({ ok: false, message: 'Internal error' }, { status: 500 })
  }
}
