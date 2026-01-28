import { NextRequest, NextResponse } from 'next/server'
import monnify from '@/services/monnify'

export async function POST(req: NextRequest) {
  try {
    const { reference } = await req.json()
    if (!reference) return NextResponse.json({ success: false, message: 'Missing reference' }, { status: 400 })
    const res = await monnify.verifyTransaction(String(reference))
    return NextResponse.json({ success: true, data: res })
  } catch (err) {
    console.error('Monnify verify error:', err)
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
