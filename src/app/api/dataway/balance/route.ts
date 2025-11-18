import { NextRequest, NextResponse } from 'next/server'
import dataway from '@/lib/dataway'

// Admin-only endpoint is recommended — this route does not implement auth checks by default.
export async function POST(_req: NextRequest) {
  try {
    const res = await dataway.callBalance()
    return NextResponse.json({ ok: true, result: res })
  } catch (err: unknown) {
    console.error('Dataway balance error', err)
    return NextResponse.json({ ok: false, message: 'Internal server error' }, { status: 500 })
  }
}
