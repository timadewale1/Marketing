import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp, increment } from 'firebase/firestore'
import type { Firestore as AdminFirestore, DocumentData } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { reference, campaignData } = body

    if (!reference || !campaignData) {
      return NextResponse.json({ success: false, message: 'Missing reference or campaignData' }, { status: 400 })
    }

  // If PAYSTACK secret is configured, verify the transaction server-side.
    if (!process.env.PAYSTACK_SECRET_KEY) {
      console.warn('PAYSTACK_SECRET_KEY not configured — skipping remote verification')
    } else {
      const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      })
      const verifyData = await res.json()
      if (!verifyData.status || verifyData.data.status !== 'success') {
        return NextResponse.json({ success: false, message: 'Payment verification failed' }, { status: 400 })
      }
      // Optionally ensure paid amount covers campaign budget (Paystack amounts are in kobo)
      const paidAmount = Number(verifyData.data.amount || 0) / 100
      type IncomingCampaign = { budget?: number }
      const expected = Number((campaignData as IncomingCampaign).budget || 0)
      if (expected > 0 && paidAmount < expected) {
        return NextResponse.json({ success: false, message: 'Payment amount mismatch' }, { status: 400 })
      }
    }

    // Attempt to initialize admin SDK lazily and use it when available
    const { admin, dbAdmin } = await initFirebaseAdmin()

    let createdId = ''
    if (dbAdmin && admin) {
      const adminDb = dbAdmin as AdminFirestore
      const ref = await adminDb.collection('campaigns').add({ ...(campaignData as DocumentData), paymentRef: reference, createdAt: admin.firestore.FieldValue.serverTimestamp() })
      createdId = ref.id
    } else {
      const created = await addDoc(collection(db, 'campaigns'), { ...(campaignData as Record<string, unknown>), paymentRef: reference, createdAt: serverTimestamp() })
      createdId = created.id
    }

    // Pay referral bonus to advertiser's referrer once (0.5% of budget)
    type IncomingCampaignFull = { ownerId?: string; budget?: number }
    const ownerId = (campaignData as IncomingCampaignFull).ownerId
    if (ownerId) {
      if (dbAdmin && admin) {
        try {
          const adminDb = dbAdmin as AdminFirestore
          const advDocRef = adminDb.collection('advertisers').doc(ownerId)
          const advSnap = await advDocRef.get()
          if (advSnap.exists) {
            const adv = advSnap.data() as Record<string, unknown>
            const referrerId = (adv.referrerId as string) || (adv.referredBy as string) || null
            const referralPaid = (adv.referralPaid as boolean) || false
            const budget = Number((campaignData as IncomingCampaignFull).budget || 0)
            if (referrerId && !referralPaid && budget > 0) {
              const bonus = Math.round(0.005 * budget)
              // use admin.firestore.FieldValue helpers
              await adminDb.collection('referrals').add({
                referrerId,
                referredId: ownerId,
                amount: bonus,
                status: 'completed',
                note: `Referral bonus for advertiser first payment (campaign ${createdId})`,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              })
              await adminDb.collection('earners').doc(referrerId).update({ balance: admin.firestore.FieldValue.increment(bonus) })
              await advDocRef.update({ referralPaid: true })
            }
          }
        } catch (e) {
          console.error('Failed to credit advertiser referrer (admin)', e)
        }
      } else {
        // fallback to client SDK operations (less ideal for server security)
        const advRef = doc(db, 'advertisers', ownerId)
        const advSnap = await getDoc(advRef)
        if (advSnap.exists()) {
          type AdvertiserDoc = { referrerId?: string; referredBy?: string; referralPaid?: boolean }
          const adv = advSnap.data() as AdvertiserDoc
          const referrerId = adv.referrerId || adv.referredBy || null
          const referralPaid = adv.referralPaid || false
          const budget = Number((campaignData as IncomingCampaignFull).budget || 0)
          if (referrerId && !referralPaid && budget > 0) {
            const bonus = Math.round(0.005 * budget)
            try {
              await addDoc(collection(db, 'referrals'), {
                referrerId,
                referredId: ownerId,
                amount: bonus,
                status: 'completed',
                note: `Referral bonus for advertiser first payment (campaign ${createdId})`,
                createdAt: serverTimestamp(),
              })
              await updateDoc(doc(db, 'earners', referrerId), { balance: increment(bonus) })
              await updateDoc(advRef, { referralPaid: true })
            } catch (e) {
              console.error('Failed to credit advertiser referrer', e)
            }
          }
        }
      }
    }

    // If this was a wallet funding flow, write an advertiserTransactions entry
    if (body.type === 'wallet_funding') {
      const userId = body.userId as string | undefined
      const amount = Number(body.amount || 0)
      if (userId && amount > 0) {
        if (dbAdmin && admin) {
          try {
            await (dbAdmin as AdminFirestore).collection('advertiserTransactions').add({
              userId,
              type: 'wallet_funding',
              amount: amount,
              status: 'completed',
              note: 'Wallet funded via Paystack',
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            })
          } catch (e) {
            console.error('Failed to write admin transaction', e)
          }
        } else {
          try {
            await addDoc(collection(db, 'advertiserTransactions'), {
              userId,
              type: 'wallet_funding',
              amount: amount,
              status: 'completed',
              note: 'Wallet funded via Paystack',
              createdAt: serverTimestamp(),
            })
          } catch (e) {
            console.error('Failed to write transaction', e)
          }
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('verify-payment error', err)
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
