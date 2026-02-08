import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import monnify from '@/services/monnify'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const reference = body?.reference as string | undefined
    const provider = (body?.provider as string | undefined) || 'paystack'
    let userId = body?.userId as string | undefined
    if (!reference) return NextResponse.json({ success: false, message: 'Missing reference' }, { status: 400 })

    let paidAmount = 0

    if (provider === 'monnify') {
      try {
        type MonnifyVerifyResult = {
          responseBody?: {
            amountPaid?: number;
            transactionAmount?: number;
            amount?: number;
            transactionAmountInKobo?: number;
            metaData?: { userId?: string };
            customer?: { externalId?: string };
          };
          response?: {
            amountPaid?: number;
            transactionAmount?: number;
            amount?: number;
            transactionAmountInKobo?: number;
            metaData?: { userId?: string };
            customer?: { externalId?: string };
          };
          amountPaid?: number;
          transactionAmount?: number;
          amount?: number;
          transactionAmountInKobo?: number;
          metaData?: { userId?: string };
          customer?: { externalId?: string };
        };
        const result: MonnifyVerifyResult = await monnify.verifyTransaction(reference)
        const resp = result?.responseBody || result?.response || result
        const rawAmount = Number(resp?.amountPaid || resp?.transactionAmount || resp?.amount || resp?.transactionAmountInKobo || 0)
        if (!rawAmount) {
          console.error('Monnify verification returned no amount for', reference, resp)
          return NextResponse.json({ success: false, message: 'Monnify verification failed' }, { status: 400 })
        }
        paidAmount = rawAmount > 100000 ? rawAmount / 100 : rawAmount
        if (!userId) userId = resp?.metaData?.userId || resp?.customer?.externalId || userId
      } catch (e) {
        console.error('Monnify verify error', e)
        return NextResponse.json({ success: false, message: 'Monnify verification failed' }, { status: 400 })
      }
    } else {
      if (!process.env.PAYSTACK_SECRET_KEY) return NextResponse.json({ success: false, message: 'PAYSTACK_SECRET_KEY not configured' }, { status: 500 })

      // encode reference to avoid problems when reference contains special chars
      const encodedRef = encodeURIComponent(String(reference))
      const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodedRef}`, {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        Accept: 'application/json',
      },
    })
      let verifyData: { status?: boolean; message?: string; data?: { status?: string; amount?: number; metadata?: { userId?: string } } } | null = null
    try {
      verifyData = await verifyRes.json()
    } catch (e) {
      console.error('Failed parsing Paystack verify response JSON', e)
      const text = await verifyRes.text().catch(() => '')
      console.error('Paystack verify raw response:', text)
      return NextResponse.json({ success: false, message: 'Payment verification failed' }, { status: 400 })
    }

      console.log('Paystack verify status:', verifyRes.status, 'body:', JSON.stringify(verifyData))
      if (!verifyData || !verifyData.status || verifyData.data?.status !== 'success') {
      // Helpful hint for common misconfiguration
      if (verifyData && (verifyData.message || '').toString().toLowerCase().includes('transaction reference not found')) {
        return NextResponse.json({
          success: false,
          message: 'Transaction reference not found. This often means the Paystack secret key does not match the environment (test vs live) that created the transaction. Ensure your `NEXT_PUBLIC_PAYSTACK_KEY` and `PAYSTACK_SECRET_KEY` are from the same Paystack account/mode.',
          details: verifyData,
        }, { status: 400 })
      }
        return NextResponse.json({ success: false, message: 'Payment verification failed', details: verifyData }, { status: 400 })
      }

      paidAmount = Number(verifyData.data.amount || 0) / 100
      if (!userId) {
        userId = verifyData.data?.metadata?.userId
      }
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

    // Finalize pending referrals for this user (transaction-safe per-referral)
    const refsSnap = await adminDb.collection('referrals').where('referredId', '==', userId).where('status', '==', 'pending').get()
    for (const rDoc of refsSnap.docs) {
      const r = rDoc.data()
      const bonus = Number(r.amount || 0)
      const referrerId = r.referrerId as string | undefined
      try {
        const rRef = adminDb.collection('referrals').doc(rDoc.id)
        await adminDb.runTransaction(async (t) => {
          const snap = await t.get(rRef)
          if (!snap.exists) return
          const status = snap.data()?.status
          if (status !== 'pending') return
          t.update(rRef, { status: 'completed', completedAt: admin.firestore.FieldValue.serverTimestamp() })
          if (referrerId && bonus > 0) {
            const txRef = adminDb.collection('advertiserTransactions').doc()
            t.set(txRef, {
              userId: referrerId,
              type: 'referral_bonus',
              amount: bonus,
              status: 'completed',
              note: `Referral bonus for referring ${userId}`,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            })
            const referrerRef = adminDb.collection('advertisers').doc(referrerId)
            t.update(referrerRef, { balance: admin.firestore.FieldValue.increment(bonus) })
          }
        })
      } catch (e) {
        console.error('Failed finalizing referral', rDoc.id, e)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('advertiser activate error', err)
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
