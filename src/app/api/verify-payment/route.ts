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
