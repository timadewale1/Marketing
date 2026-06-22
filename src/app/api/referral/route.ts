import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore'
import { REFERRAL_ACTIVATED_POINTS, awardPointsInTransaction, getPointsEventId } from '@/lib/points'
import { recordWeeklyReferralActivationInTransaction } from '@/lib/referral-weekly.server'
import { getReferralActivationBonusAmount, normalizeActivationReferralPendingAmount } from '@/lib/referral-rewards'
import { applyRecoveryAwareCreditInTransaction } from '@/lib/balance-recovery'

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
        bonusPaid: false,
      }

      const [referrerEarnerSnap, referrerAdvertiserSnap, referrerVendorSnap, referrerCustomerSnap] = await Promise.all([
        transaction.get(adminDb.collection('earners').doc(referrerId)),
        transaction.get(adminDb.collection('advertisers').doc(referrerId)),
        transaction.get(adminDb.collection('vendors').doc(referrerId)),
        transaction.get(adminDb.collection('customers').doc(referrerId)),
      ])
      const referrerCollection = referrerAdvertiserSnap.exists
        ? 'advertisers'
        : referrerEarnerSnap.exists
          ? 'earners'
          : referrerVendorSnap.exists
            ? 'vendors'
            : referrerCustomerSnap.exists
              ? 'customers'
              : null
      if (referrerCollection) {
        transaction.set(
          adminDb.collection(referrerCollection).doc(referrerId),
          {
            pointsReferralCount: admin.firestore.FieldValue.increment(1),
            pointsLastReferralAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      }

      if (userType === 'earner' || userType === 'advertiser') {
        transaction.set(referralRef, {
          ...referralDoc,
          amount: getReferralActivationBonusAmount(),
          condition: 'activation',
        })
      } else if (userType === 'vendor') {
        transaction.set(referralRef, {
          ...referralDoc,
          amount: 1000,
          condition: 'vendor_setup_fee',
        })
      } else if (userType === 'customer') {
        transaction.set(referralRef, {
          ...referralDoc,
          amount: 0,
          condition: 'none',
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

      // Determine where the referrer lives (earner/advertiser/vendor/customer)
      const earnerRef = adminDb.collection('earners').doc(referral.referrerId)
      const advertiserRef = adminDb.collection('advertisers').doc(referral.referrerId)
      const vendorRef = adminDb.collection('vendors').doc(referral.referrerId)
      const customerRef = adminDb.collection('customers').doc(referral.referrerId)

      const [earnerSnap, advertiserSnap, vendorSnap, customerSnap] = await Promise.all([
        transaction.get(earnerRef),
        transaction.get(advertiserRef),
        transaction.get(vendorRef),
        transaction.get(customerRef),
      ])

      const referrerCollection = advertiserSnap.exists
        ? 'advertisers'
        : earnerSnap.exists
          ? 'earners'
          : vendorSnap.exists
            ? 'vendors'
            : customerSnap.exists
              ? 'customers'
              : null

      if (!referrerCollection) throw new Error('Referrer account not found')

      const targetCollectionName =
        referrerCollection === 'advertisers'
          ? 'advertiserTransactions'
          : referrerCollection === 'earners'
            ? 'earnerTransactions'
            : referrerCollection === 'vendors'
              ? 'vendorTransactions'
              : 'customerTransactions'

      const txRef = adminDb.collection(targetCollectionName).doc(transactionId)
      const txSnap = await transaction.get(txRef)
      if (txSnap.exists) throw new Error('Transaction already processed')

      // Process payment based on referral type/action
      const condition = String(referral.condition || 'activation').toLowerCase()
      const amount =
        condition === 'activation'
          ? normalizeActivationReferralPendingAmount()
          : condition === 'vendor_setup_fee' || condition === 'setup_fee'
            ? Number(referral.amount || 1000)
            : Number(referral.amount || getReferralActivationBonusAmount())
      if (!(amount > 0)) throw new Error('Invalid referral amount')

      const referrerData = (
        referrerCollection === 'earners'
          ? earnerSnap.data()
          : referrerCollection === 'advertisers'
            ? advertiserSnap.data()
            : referrerCollection === 'vendors'
              ? vendorSnap.data()
              : customerSnap.data()
      ) as
        | { fullName?: string; name?: string; businessName?: string; companyName?: string; email?: string }
        | undefined
      if (condition === 'activation' && (referrerCollection === 'earners' || referrerCollection === 'advertisers')) {
        await awardPointsInTransaction({
          adminDb,
          admin,
          transaction,
          userCollection: referrerCollection,
          userId: referral.referrerId,
          amount: REFERRAL_ACTIVATED_POINTS,
          eventId: getPointsEventId('referral-activated', referralId),
          type: 'referral_activated',
          note: `Referral activation bonus for referring ${referral.referredId}`,
          referenceId: referral.referredId,
          extraUserUpdates: {
            pointsActivatedReferralCount: admin.firestore.FieldValue.increment(1),
            pointsLastActivatedReferralAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          extraLedgerData: {
            referralId,
            referredUserId: referral.referredId,
          },
        })
      }

      // Credit the referrer (earner or advertiser)
      const recoveryResult = await applyRecoveryAwareCreditInTransaction({
        adminDb,
        admin,
        transaction,
        userCollection: referrerCollection,
        userId: referral.referrerId,
        amount,
        transactionCollection: targetCollectionName as
          | 'earnerTransactions'
          | 'advertiserTransactions'
          | 'vendorTransactions'
          | 'customerTransactions',
        recoveryNote: 'Automatic recovery deduction from a previous reversal',
        transactionType: 'balance_recovery_deduction',
        transactionExtras: {
          referralId,
          referredUserId: referral.referredId,
        },
      })

      // Log transaction in the correct transactions collection
      transaction.set(txRef, {
        userId: referral.referrerId,
        type: 'referral_bonus',
        amount,
        netAmount: recoveryResult.netCredited,
        recoveryOffsetApplied: recoveryResult.offsetApplied,
        status: 'completed',
        note: `Referral bonus for ${referral.referredId} ${action}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Mark referral completed
      transaction.update(referralRef, {
        status: 'completed',
        bonusPaid: true,
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        paidAmount: amount,
        amount,
      })

      return { success: true }
    })

    await adminDb.runTransaction(async (weeklyTransaction) => {
      const referralRef = adminDb.collection('referrals').doc(referralId)
      const referralSnap = await weeklyTransaction.get(referralRef)
      if (!referralSnap.exists) return
      const referral = referralSnap.data()
      if (!referral || !referral.bonusPaid) return
      const condition = String(referral.condition || 'activation').toLowerCase()
      if (condition !== 'activation') return

      const earnerRef = adminDb.collection('earners').doc(referral.referrerId)
      const advertiserRef = adminDb.collection('advertisers').doc(referral.referrerId)
      const [earnerSnap, advertiserSnap] = await Promise.all([
        weeklyTransaction.get(earnerRef),
        weeklyTransaction.get(advertiserRef),
      ])
      const referrerData = (earnerSnap.exists ? earnerSnap.data() : advertiserSnap.data()) as
        | { fullName?: string; name?: string; businessName?: string; companyName?: string; email?: string }
        | undefined

      await recordWeeklyReferralActivationInTransaction({
        adminDb,
        transaction: weeklyTransaction,
        role: earnerSnap.exists ? 'earner' : 'advertiser',
        userId: referral.referrerId,
        name: String(
          referrerData?.fullName ||
            referrerData?.name ||
            referrerData?.businessName ||
            referrerData?.companyName ||
            referrerData?.email ||
            ''
        ).trim(),
        email: referrerData?.email || null,
        referredId: referral.referredId,
        referralId,
      })
    })

    return NextResponse.json({ success: true, message: 'Referral reward processed' })
  } catch (err) {
    console.error('Referral reward error:', err)
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 })
  }
}
