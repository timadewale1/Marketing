import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const email = String(body?.email || '').trim().toLowerCase()
    const phone = String(body?.phone || '').trim()

    if (!email && !phone) {
      return NextResponse.json(
        { success: false, message: 'Email or phone is required' },
        { status: 400 }
      )
    }

    const { dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin) {
      return NextResponse.json({ success: false, message: 'Firebase admin unavailable' }, { status: 500 })
    }

    for (const collectionName of ['advertisers', 'earners']) {
      if (email) {
        const emailSnap = await dbAdmin
          .collection(collectionName)
          .where('email', '==', email)
          .limit(1)
          .get()
        if (!emailSnap.empty) {
          return NextResponse.json({ success: true, unique: false, duplicate: 'email' })
        }
      }

      if (phone) {
        const phoneSnap = await dbAdmin
          .collection(collectionName)
          .where('phone', '==', phone)
          .limit(1)
          .get()
        if (!phoneSnap.empty) {
          return NextResponse.json({ success: true, unique: false, duplicate: 'phone' })
        }
      }
    }

    return NextResponse.json({ success: true, unique: true })
  } catch (error) {
    console.error('Availability check error:', error)
    return NextResponse.json({ success: false, message: 'Failed to check availability' }, { status: 500 })
  }
}
