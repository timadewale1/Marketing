import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore'

// Handle referral processing for both earners and advertisers
export async function POST(req: Request) {
  try {
    const { referrerId, referredId, userType } = await req.json()
    
    if (!referrerId || !referredId || !userType) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin || !admin) {
      return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })
    }

    const adminDb = dbAdmin as AdminFirestore

    // Use transaction for atomicity
    await adminDb.runTransaction(async (transaction) => {
      // Create idempotent referral ID
      const referralId = `${referrerId}-${referredId}`
      const referralRef = adminDb.collection('referrals').doc(referralId)
      const referralSnap = await transaction.get(referralRef)

      // Check for existing referral to prevent duplicates
      if (referralSnap.exists) {
        throw new Error('Referral already exists')
      }

      // Common referral fields
      const referralDoc = {
        referrerId,
        referredId,
        userType,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'pending',
        bonusPaid: false
      }

      if (userType === 'earner') {
        // Earner referral (₦1000 after activation)
        transaction.set(referralRef, {
          ...referralDoc,
          amount: 1000,
          condition: 'activation'
        })
      } else if (userType === 'advertiser') {
        // Advertiser referral (₦1,000 after advertiser activation)
        transaction.set(referralRef, {
          ...referralDoc,
          amount: 1000,
          condition: 'activation'
        })
      } else {
        throw new Error('Invalid user type')
      }

      return { success: true }
    })

    return NextResponse.json({ success: true, message: 'Referral recorded' })
  } catch (err) {
    console.error('Referral processing error:', err)
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 })
  }
}

// Handle referral reward payments
export async function PUT(req: Request) {
  try {
    const { referralId, action, campaignAmount } = await req.json()
    
    if (!referralId || !action) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin || !admin) {
      return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })
    }

    const adminDb = dbAdmin as AdminFirestore

    // Use transaction for atomic updates
    await adminDb.runTransaction(async (transaction) => {
      const referralRef = adminDb.collection('referrals').doc(referralId)
      const referralSnap = await transaction.get(referralRef)

      if (!referralSnap.exists) {
        throw new Error('Referral not found')
      }

      const referral = referralSnap.data()
      if (!referral) {
        throw new Error('Invalid referral data')
      }

      // Prevent duplicate payments
      if (referral.bonusPaid) {
        throw new Error('Bonus already paid')
      }

      // Generate unique transaction ID
      const transactionId = `${referralId}-${action}-${Date.now()}`
      const txRef = adminDb.collection('earnerTransactions').doc(transactionId)

      // Check for existing transaction
      const txSnap = await transaction.get(txRef)
      if (txSnap.exists) {
        throw new Error('Transaction already processed')
      }

      // Process payment based on referral type
      if (referral.userType === 'earner' && action === 'activate') {
        // Pay earner referral bonus on activation
        const amount = referral.amount || 1000 // Default to ₦1000 if not specified
        
        // Update referrer balance
        transaction.update(adminDb.collection('earners').doc(referral.referrerId), {
          balance: admin.firestore.FieldValue.increment(amount)
        })

        // Log transaction
        transaction.set(txRef, {
          userId: referral.referrerId,
          type: 'referral_bonus',
          amount,
          status: 'completed',
          note: `Referral bonus for ${referral.referredId} activation`,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        })

        // Mark referral completed
        transaction.update(referralRef, {
          status: 'completed',
          bonusPaid: true,
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          paidAmount: amount
        })

      } else if (referral.userType === 'advertiser' && action === 'campaign_payment' && campaignAmount) {
        // Backwards-compat: if campaign_payment action is used, keep existing behavior
        // (but we will still compute based on referral.amount if provided).
        const amount = referral.amount || 1000
        if (amount > 0) {
          // Credit referrer balance (assume referrer is an earner)
          transaction.update(adminDb.collection('earners').doc(referral.referrerId), {
            balance: admin.firestore.FieldValue.increment(amount)
          })

          // Log transaction
          transaction.set(txRef, {
            userId: referral.referrerId,
            type: 'referral_bonus',
            amount,
            status: 'completed',
            note: `Referral bonus for ${referral.referredId}'s first campaign`,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          })

          // Mark referral completed
          transaction.update(referralRef, {
            status: 'completed',
            bonusPaid: true,
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            paidAmount: amount,
            campaignAmount: Number(campaignAmount)
          })
        }
      } else if (referral.userType === 'advertiser' && action === 'activate') {
        // New behavior: pay a fixed amount (default ₦1,000) when an advertiser is activated
        const amount = referral.amount || 1000
        if (amount > 0) {
          // Credit referrer balance (assume referrer is an earner)
          transaction.update(adminDb.collection('earners').doc(referral.referrerId), {
            balance: admin.firestore.FieldValue.increment(amount)
          })

          // Log transaction
          transaction.set(txRef, {
            userId: referral.referrerId,
            type: 'referral_bonus',
            amount,
            status: 'completed',
            note: `Referral bonus for ${referral.referredId} advertiser activation`,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          })

          // Mark referral completed
          transaction.update(referralRef, {
            status: 'completed',
            bonusPaid: true,
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            paidAmount: amount
          })
        }
      }

      return { success: true }
    })

    return NextResponse.json({ success: true, message: 'Referral reward processed' })
  } catch (err) {
    console.error('Referral reward error:', err)
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 })
  }
}