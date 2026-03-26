import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin-session'

export async function GET() {
  try {
    const session = await requireAdminSession()
    return NextResponse.json({ authenticated: true, uid: session.uid, email: session.email })
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
}
