import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const reference = body?.reference as string | undefined
    let userId = body?.userId as string | undefined
    if (!reference) return NextResponse.json({ success: false, message: 'Missing reference' }, { status: 400 })

    if (!process.env.PAYSTACK_SECRET_KEY) return NextResponse.json({ success: false, message: 'PAYSTACK_SECRET_KEY not configured' }, { status: 500 })

    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    })
    const verifyData = await verifyRes.json()
    if (!verifyData.status || verifyData.data.status !== 'success') {
      return NextResponse.json({ success: false, message: 'Payment verification failed' }, { status: 400 })
    }

    const paidAmount = Number(verifyData.data.amount || 0) / 100
    if (!userId) {
      userId = verifyData.data?.metadata?.userId
    }
    if (!userId) return NextResponse.json({ success: false, message: 'Missing userId' }, { status: 400 })
    if (paidAmount < 2000) {
      return NextResponse.json({ success: false, message: 'Insufficient payment amount' }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin || !admin) return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })

    const adminDb = dbAdmin as import('firebase-admin').firestore.Firestore

    // Mark advertiser activated
    await adminDb.collection('advertisers').doc(userId).update({
      activated: true,
      activatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    // Finalize pending referrals for this user
    const refsSnap = await adminDb.collection('referrals').where('referredId', '==', userId).where('status', '==', 'pending').get()
    for (const rDoc of refsSnap.docs) {
      const r = rDoc.data()
      const bonus = Number(r.amount || 0)
      const referrerId = r.referrerId as string | undefined
      await adminDb.collection('referrals').doc(rDoc.id).update({ status: 'completed', completedAt: admin.firestore.FieldValue.serverTimestamp() })
      if (referrerId && bonus > 0) {
        await adminDb.collection('advertiserTransactions').add({
          userId: referrerId,
          type: 'referral_bonus',
          amount: bonus,
          status: 'completed',
          note: `Referral bonus for referring ${userId}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        await adminDb.collection('advertisers').doc(referrerId).update({ balance: admin.firestore.FieldValue.increment(bonus) })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('advertiser activate error', err)
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
