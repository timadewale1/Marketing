import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { reference, campaignData, type, userId, amount } = body

    if (!reference) {
      return NextResponse.json({ success: false, message: 'Missing payment reference' }, { status: 400 })
    }

    // Initialize admin SDK
    const { admin, dbAdmin } = await initFirebaseAdmin()
    const adminDb = dbAdmin as AdminFirestore

    // Verify payment with Paystack
    if (!process.env.PAYSTACK_SECRET_KEY) {
      console.warn('PAYSTACK_SECRET_KEY not configured — skipping remote verification')
    } else {
      try {
        const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
          headers: { 
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          },
        })
        
        if (!res.ok) {
          console.error('Payment verification request failed:', await res.text())
          return NextResponse.json({ success: false, message: 'Failed to verify payment with provider' }, { status: 500 })
        }

        const verifyData = await res.json()
        
        if (!verifyData.status) {
          console.error('Payment verification error:', verifyData)
          return NextResponse.json({ success: false, message: verifyData.message || 'Reference not found' }, { status: 400 })
        }

        if (verifyData.data.status !== 'success') {
          return NextResponse.json({ success: false, message: 'Payment not successful' }, { status: 400 })
        }
        
        // For campaign payments, ensure amount matches (Paystack amounts are in kobo)
        if (campaignData) {
          const paidAmount = Number(verifyData.data.amount || 0) / 100
          const expected = Number(campaignData.budget || 0)
          if (expected > 0 && paidAmount < expected) {
            return NextResponse.json({ success: false, message: 'Payment amount does not match campaign budget' }, { status: 400 })
          }
        }
      } catch (error) {
        console.error('Payment verification request failed:', error)
        return NextResponse.json({ success: false, message: 'Failed to verify payment' }, { status: 500 })
      }
    }

    // Handle campaign creation if this is a campaign payment
    let createdId = ''
    if (campaignData) {
      try {
        if (dbAdmin && admin) {
          const ref = await adminDb.collection('campaigns').add({
            ...campaignData,
            paymentRef: reference,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          })
          createdId = ref.id
        } else {
          const created = await addDoc(collection(db, 'campaigns'), {
            ...campaignData,
            paymentRef: reference,
            createdAt: serverTimestamp()
          })
          createdId = created.id
        }

        // Handle referral bonus for advertiser (0.5% of budget)
        if (campaignData.ownerId) {
          if (dbAdmin && admin) {
            try {
              const advDocRef = adminDb.collection('advertisers').doc(campaignData.ownerId)
              const advSnap = await advDocRef.get()
              if (advSnap.exists) {
                const adv = advSnap.data() as Record<string, unknown>
                const referrerId = (adv.referrerId as string) || (adv.referredBy as string) || null
                const referralPaid = (adv.referralPaid as boolean) || false
                const budget = Number(campaignData.budget || 0)
                if (referrerId && !referralPaid && budget > 0) {
                  const bonus = Math.round(0.005 * budget)
                  await adminDb.collection('referrals').add({
                    referrerId,
                    referredId: campaignData.ownerId,
                    amount: bonus,
                    status: 'completed',
                    note: `Referral bonus for advertiser first payment (campaign ${createdId})`,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                  })
                  await adminDb.collection('earners').doc(referrerId).update({
                    balance: admin.firestore.FieldValue.increment(bonus)
                  })
                  await advDocRef.update({ referralPaid: true })
                }
              }
            } catch (e) {
              console.error('Failed to credit advertiser referrer:', e)
            }
          }
        }
      } catch (e) {
        console.error('Failed to create campaign:', e)
        return NextResponse.json({ success: false, message: 'Failed to create campaign' }, { status: 500 })
      }
    }

    // Handle wallet funding
    if (type === 'wallet_funding' && userId && amount > 0) {
      try {
        if (dbAdmin && admin) {
          await adminDb.collection('advertiserTransactions').add({
            userId,
            type: 'wallet_funding',
            amount,
            status: 'completed',
            note: 'Wallet funded via Paystack',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          })
        } else {
          await addDoc(collection(db, 'advertiserTransactions'), {
            userId,
            type: 'wallet_funding',
            amount,
            status: 'completed',
            note: 'Wallet funded via Paystack',
            createdAt: serverTimestamp(),
          })
        }
      } catch (e) {
        console.error('Failed to record wallet funding:', e)
        return NextResponse.json({ success: false, message: 'Failed to record transaction' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Payment processing error:', err)
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
