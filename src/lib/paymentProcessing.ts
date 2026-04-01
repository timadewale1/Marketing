// Payment processing utilities for reliable activation and wallet funding
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore'

async function processPendingActivationReferrals(
  adminDb: AdminFirestore,
  admin: typeof import('firebase-admin'),
  userId: string
) {
  const refsSnap = await adminDb.collection('referrals')
    .where('referredId', '==', userId)
    .where('status', '==', 'pending')
    .get()

  console.log(`[activation][retry] processing ${refsSnap.size} referrals for ${userId}`)

  for (const rDoc of refsSnap.docs) {
    const r = rDoc.data()
    const bonus = Number(r.amount || 0)
    const referrerId = r.referrerId

    try {
      await adminDb.runTransaction(async (t) => {
        const referralRef = adminDb.collection('referrals').doc(rDoc.id)
        const snap = await t.get(referralRef)
        if (!snap.exists || snap.data()?.status !== 'pending') return

        t.update(referralRef, {
          status: 'completed',
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          bonusPaid: true,
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          paidAmount: bonus,
        })

        if (!referrerId || bonus <= 0) return

        const advRef = adminDb.collection('advertisers').doc(referrerId)
        const earnerRef = adminDb.collection('earners').doc(referrerId)

        const [advSnap, earnerSnap] = await Promise.all([
          t.get(advRef),
          t.get(earnerRef)
        ])

        if (advSnap.exists) {
          t.set(adminDb.collection('advertiserTransactions').doc(), {
            userId: referrerId,
            type: 'referral_bonus',
            amount: bonus,
            status: 'completed',
            note: `Referral bonus for referring ${userId}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          })
          t.update(advRef, { balance: admin.firestore.FieldValue.increment(bonus) })
        } else if (earnerSnap.exists) {
          t.set(adminDb.collection('earnerTransactions').doc(), {
            userId: referrerId,
            type: 'referral_bonus',
            amount: bonus,
            status: 'completed',
            note: `Referral bonus for referring ${userId}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          })
          t.update(earnerRef, { balance: admin.firestore.FieldValue.increment(bonus) })
        }
      })
    } catch (e) {
      console.error(`[activation][retry] failed processing referral ${rDoc.id}:`, e)
    }
  }
}

export async function processActivationWithRetry(userId: string, reference: string, provider: string = 'monnify', maxRetries: number = 3) {
  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin || !admin) throw new Error('Firebase admin not initialized')

  const adminDb = dbAdmin as AdminFirestore

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[activation][retry] attempt ${attempt} for user ${userId}`)

      // Check if already activated (check both collections)
      const earnerSnap = await adminDb.collection('earners').doc(userId).get()
      const advertiserSnap = await adminDb.collection('advertisers').doc(userId).get()
      
      const userDoc = earnerSnap.exists ? earnerSnap : advertiserSnap
      const userType = earnerSnap.exists ? 'earners' : 'advertisers'
      
      if (userDoc.exists && userDoc.data()?.activated) {
        console.log(`[activation][retry] user ${userId} already activated`)
        await processPendingActivationReferrals(adminDb, admin, userId)
        return { success: true, alreadyActivated: true }
      }

      // Store activation reference for webhook processing
      await adminDb.collection(userType).doc(userId).update({
        activationReference: reference,
        activationAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Mark user activated
      const updateData: Record<string, boolean | ReturnType<typeof admin.firestore.FieldValue.serverTimestamp> | string> = {
        activated: true,
        activatedAt: admin.firestore.FieldValue.serverTimestamp(),
        activationPaymentProvider: provider,
      }
      
      // For earners, add next activation due (3 months)
      if (userType === 'earners') {
        const THREE_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 3;
        updateData.nextActivationDue = admin.firestore.Timestamp.fromMillis(Date.now() + THREE_MONTHS_MS);
      }
      
      await adminDb.collection(userType).doc(userId).update(updateData)

      // Create activation fee transaction record (platform revenue; not credited to user)
      const collectionName = userType === 'earners' ? 'earnerTransactions' : 'advertiserTransactions'
      await adminDb.collection(collectionName).doc().set({
        userId,
        type: 'activation_fee',
        amount: -2000,
        provider,
        reference,
        status: 'completed',
        note: `Activation fee payment`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      await processPendingActivationReferrals(adminDb, admin, userId)

      console.log(`[activation][retry] success for user ${userId}`)
      return { success: true, attempt }

    } catch (error) {
      console.error(`[activation][retry] attempt ${attempt} failed for ${userId}:`, error)

      if (attempt >= maxRetries) {
        throw new Error(`Activation failed after ${maxRetries} attempts: ${error}`)
      }

      // Wait before retry (exponential backoff)
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}

export async function processWalletFundingWithRetry(
  userId: string,
  reference: string,
  amount: number,
  provider: string = 'monnify',
  userType: 'advertiser' | 'earner' = 'advertiser',
  maxRetries: number = 3
) {
  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin || !admin) throw new Error('Firebase admin not initialized')

  const adminDb = dbAdmin as AdminFirestore
  const collectionName = userType === 'advertiser' ? 'advertiserTransactions' : 'earnerTransactions'
  const userCollection = userType === 'advertiser' ? 'advertisers' : 'earners'

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[wallet-funding][retry] attempt ${attempt} for ${userType} ${userId}, amount: ${amount}`)

      // Check if already processed
      const existingTxSnap = await adminDb.collection(collectionName)
        .where('userId', '==', userId)
        .where('reference', '==', reference)
        .where('type', '==', 'wallet_funding')
        .where('status', '==', 'completed')
        .limit(1)
        .get()

      if (!existingTxSnap.empty) {
        console.log(`[wallet-funding][retry] already processed for ${userId}`)
        return { success: true, alreadyProcessed: true }
      }

      // Create transaction record
      const txRef = adminDb.collection(collectionName).doc()
      await txRef.set({
        userId,
        type: 'wallet_funding',
        amount,
        provider,
        reference,
        status: 'completed',
        note: `Wallet funded via ${provider}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Update balance
      await adminDb.collection(userCollection).doc(userId).update({
        balance: admin.firestore.FieldValue.increment(amount),
      })

      console.log(`[wallet-funding][retry] success for ${userType} ${userId}`)
      return { success: true, attempt, txId: txRef.id }

    } catch (error) {
      console.error(`[wallet-funding][retry] attempt ${attempt} failed for ${userId}:`, error)

      if (attempt >= maxRetries) {
        throw new Error(`Wallet funding failed after ${maxRetries} attempts: ${error}`)
      }

      // Wait before retry (exponential backoff)
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}
