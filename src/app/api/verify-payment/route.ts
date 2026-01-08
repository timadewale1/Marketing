import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, setDoc } from 'firebase/firestore'
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('verify-payment called with body:', JSON.stringify(body))
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
        // encode reference to avoid problems when reference contains special chars
        const encodedRef = encodeURIComponent(String(reference))
        const res = await fetch(`https://api.paystack.co/transaction/verify/${encodedRef}`, {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            Accept: 'application/json',
          },
        })
        
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          console.error('Payment verification request failed:', res.status, text)
          return NextResponse.json({ success: false, message: 'Failed to verify payment with provider', details: text }, { status: 500 })
        }

        const verifyData = await res.json()
        
        if (!verifyData.status) {
          console.error('Payment verification error:', verifyData)
          // helpful hint when Paystack returns transaction not found
          if ((verifyData.message || '').toString().toLowerCase().includes('transaction reference not found')) {
            return NextResponse.json({ success: false, message: 'Transaction reference not found. Ensure server PAYSTACK_SECRET_KEY and client NEXT_PUBLIC_PAYSTACK_KEY are from the same Paystack account/mode.', details: verifyData }, { status: 400 })
          }
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
    if (campaignData) {
      try {
        if (dbAdmin && admin) {
          await adminDb.collection('campaigns').add({
            ...campaignData,
            paymentRef: reference,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          })
          // notify admin
          await adminDb.collection('adminNotifications').add({
            type: 'campaign_created',
            title: 'New campaign (paid)',
            body: `${String(campaignData.title || 'Untitled')} was created via payment`,
            link: '/admin/campaigns',
            campaignTitle: String(campaignData.title || ''),
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          })
        } else {
          await addDoc(collection(db, 'campaigns'), {
            ...campaignData,
            paymentRef: reference,
            createdAt: serverTimestamp()
          })
          await addDoc(collection(db, 'adminNotifications'), {
            type: 'campaign_created',
            title: 'New campaign (paid)',
            body: `${String(campaignData.title || 'Untitled')} was created via payment`,
            link: '/admin/campaigns',
            campaignTitle: String(campaignData.title || ''),
            read: false,
            createdAt: serverTimestamp(),
          })
        }

        // NOTE: Referral bonus on advertiser first payment used to be processed here
        // as a percentage of campaign budget. Business rule changed: advertiser
        // referrals are now paid on advertiser activation (fixed ₦1,000). Referral
        // creation on signup already records a pending referral; activation will
        // be finalized by calling the referral API (PUT with action 'activate').
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
          // increment advertiser balance
          try {
            const advRef = adminDb.collection('advertisers').doc(userId)
            await advRef.update({ balance: admin.firestore.FieldValue.increment(Number(amount)) })
          } catch (updErr) {
            console.warn('Failed to increment advertiser balance', updErr)
          }
          // notify admin of funding
          await adminDb.collection('adminNotifications').add({
            type: 'wallet_funding',
            title: 'Wallet funded',
            body: `Advertiser ${userId} funded wallet with ₦${amount}`,
            link: '/admin/transactions',
            userId,
            amount,
            read: false,
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
          await addDoc(collection(db, 'adminNotifications'), {
            type: 'wallet_funding',
            title: 'Wallet funded',
            body: `Advertiser ${userId} funded wallet with ₦${amount}`,
            link: '/admin/transactions',
            userId,
            amount,
            read: false,
            createdAt: serverTimestamp(),
          })
          // attempt to increment advertiser profile balance in client-firestore path
          try {
            const advRef = doc(db, 'advertisers', userId)
            const advSnap = await getDoc(advRef)
            if (advSnap.exists()) {
              const prev = Number(advSnap.data()?.balance || 0)
              await updateDoc(advRef, { balance: prev + Number(amount) })
            } else {
              await setDoc(advRef, { balance: Number(amount) }, { merge: true })
            }
          } catch (updErr) {
            console.warn('Failed to update advertiser balance (client path)', updErr)
          }
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
