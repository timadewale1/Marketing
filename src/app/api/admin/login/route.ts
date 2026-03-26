import { NextResponse } from 'next/server'
import { createAdminSessionCookie, setAdminSessionCookie } from '@/lib/admin-session'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const idToken = body?.idToken
    if (!idToken) {
      return NextResponse.json({ message: 'Missing Firebase ID token' }, { status: 400 })
    }

    const session = await createAdminSessionCookie(idToken)
    await setAdminSessionCookie(session.sessionCookie)

    return NextResponse.json({
      authenticated: true,
      uid: session.uid,
      email: session.email,
    })
  } catch (err) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Login failed'
    const status = message === 'User is not authorized as admin' ? 403 : 500
    return NextResponse.json({ message }, { status })
  }
}
