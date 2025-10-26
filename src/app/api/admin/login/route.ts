import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const password = body?.password
    if (!password) return NextResponse.json({ message: 'Missing password' }, { status: 400 })

    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
    if (!ADMIN_PASSWORD) {
      console.error('ADMIN_PASSWORD not set')
      return NextResponse.json({ message: 'Server misconfiguration' }, { status: 500 })
    }

    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json({ message: 'Incorrect password' }, { status: 401 })
    }

    const res = NextResponse.json({ authenticated: true })
    res.cookies.set({
      name: 'adminSession',
      value: '1',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60,
    })
    return res
  } catch (err) {
    console.error(err)
    return NextResponse.json({ message: 'Login failed' }, { status: 500 })
  }
}
