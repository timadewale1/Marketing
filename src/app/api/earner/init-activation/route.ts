import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const userId = body?.userId as string | undefined
    if (!userId) return NextResponse.json({ success: false, message: 'Missing userId' }, { status: 400 })

    if (!process.env.PAYSTACK_SECRET_KEY) return NextResponse.json({ success: false, message: 'PAYSTACK_SECRET_KEY not configured' }, { status: 500 })

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin || !admin) return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })

    const adminDb = dbAdmin as import('firebase-admin').firestore.Firestore
    const earnerDoc = await adminDb.collection('earners').doc(userId).get()
    if (!earnerDoc.exists) return NextResponse.json({ success: false, message: 'Earner not found' }, { status: 404 })
    const earner = earnerDoc.data() as Record<string, unknown>
    const email = earner.email as string | undefined
    if (!email) return NextResponse.json({ success: false, message: 'Earner has no email' }, { status: 400 })

    const amountKobo = 2000 * 100
    const callbackUrl = (process.env.SITE_URL || '') + '/earner/activate/callback'

    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, amount: amountKobo, callback_url: callbackUrl, metadata: { userId } }),
    })
    const data = await res.json()
    if (!data.status) return NextResponse.json({ success: false, message: 'Paystack init failed' }, { status: 500 })

    return NextResponse.json({ success: true, authorization_url: data.data.authorization_url, reference: data.data.reference })
  } catch (err) {
    console.error('init-activation error', err)
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
