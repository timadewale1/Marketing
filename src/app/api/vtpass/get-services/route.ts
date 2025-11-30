import { NextResponse } from 'next/server'

// Minimal categories for the VTpass services page. These can be expanded to call VTpass if needed.
export async function GET() {
  return NextResponse.json({ ok: true, result: [
    { id: 'airtime', name: 'Airtime' },
    { id: 'data', name: 'Data' },
    { id: 'electricity', name: 'Electricity' },
    { id: 'tv', name: 'Cable TV' },
    { id: 'education', name: 'Education' },
  ] })
}
