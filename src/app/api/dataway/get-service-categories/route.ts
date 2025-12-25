import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ ok: false, message: 'Dataway API removed. Use /api/vtpass endpoints.' }, { status: 410 })
}
