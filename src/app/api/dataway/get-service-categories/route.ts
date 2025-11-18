import { NextRequest, NextResponse } from 'next/server'
import { getCategories } from '@/lib/dataway'

export async function GET(_req: NextRequest) {
  try {
    const res = await getCategories()
    return NextResponse.json({ ok: true, result: res })
  } catch (err: unknown) {
    console.error('get-service-categories error', err)
    return NextResponse.json({ ok: false, message: 'Internal server error' }, { status: 500 })
  }
}
