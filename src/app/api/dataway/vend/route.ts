import { NextResponse } from 'next/server'

// Dataway endpoints have been removed. Use the VTpass API routes under /api/vtpass.
export async function POST() {
  return NextResponse.json({ ok: false, message: 'Dataway API removed. Use /api/vtpass endpoints.' }, { status: 410 })
}
