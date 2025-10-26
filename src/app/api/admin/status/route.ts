import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const val = cookieStore.get('adminSession')?.value
    if (val === '1') return NextResponse.json({ authenticated: true })
    return NextResponse.json({ authenticated: false }, { status: 401 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ authenticated: false }, { status: 500 })
  }
}
