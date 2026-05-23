// Payment processing utilities for reliable activation and wallet funding
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { markActivationAttemptCompleted, recordActivationAttempt } from '@/lib/activation-attempts'
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore'
import { REFERRAL_ACTIVATED_POINTS, awardPointsInTransaction, getPointsEventId } from '@/lib/points'
import { recordWeeklyReferralActivationInTransaction } from '@/lib/referral-weekly.server'
export { extractMonnifyReferenceCandidates } from '@/lib/monnify-reference'

type UserRole = 'earner' | 'advertiser'

function normalizeReferenceSet(values: unknown[]) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

function referencesOverlap(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return false
  const rightSet = new Set(right)
  return left.some((value) => rightSet.has(value))
}

export async function processPendingActivationReferrals(
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
        if (!referrerId || bonus <= 0) return

        const advRef = adminDb.collection('advertisers').doc(referrerId)
        const earnerRef = adminDb.collection('earners').doc(referrerId)

        const [advSnap, earnerSnap] = await Promise.all([
          t.get(advRef),
          t.get(earnerRef)
        ])

        const referrerCollection = advSnap.exists ? 'advertisers' : 'earners'
        const referrerData = (advSnap.exists ? advSnap.data() : earnerSnap.data()) as
          | { fullName?: string; name?: string; businessName?: string; companyName?: string; email?: string }
          | undefined
        await recordWeeklyReferralActivationInTransaction({
          adminDb,
          admin,
          transaction: t,
          role: advSnap.exists ? 'advertiser' : 'earner',
          userId: referrerId,
          name: String(
            referrerData?.fullName ||
              referrerData?.name ||
              referrerData?.businessName ||
              referrerData?.companyName ||
              referrerData?.email ||
              ''
          ).trim(),
          email: referrerData?.email || null,
          referredId: userId,
          referralId: rDoc.id,
        })
        await awardPointsInTransaction({
          adminDb,
          admin,
          transaction: t,
          userCollection: referrerCollection,
          userId: referrerId,
          amount: REFERRAL_ACTIVATED_POINTS,
          eventId: getPointsEventId('referral-activated', rDoc.id),
          type: 'referral_activated',
          note: `Referral activation bonus for referring ${userId}`,
          referenceId: userId,
          extraUserUpdates: {
            pointsActivatedReferralCount: admin.firestore.FieldValue.increment(1),
            pointsLastActivatedReferralAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          extraLedgerData: {
            referralId: rDoc.id,
            referredUserId: userId,
          },
        })

        t.update(referralRef, {
          status: 'completed',
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          bonusPaid: true,
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          paidAmount: bonus,
        })

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

export async function processActivationWithRetry(
  userId: string,
  reference: string,
  provider: string = 'monnify',
  maxRetries: number = 3,
  extraReferences: string[] = []
) {
  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin || !admin) throw new Error('Firebase admin not initialized')

  const adminDb = dbAdmin as AdminFirestore
  const activationReferences = [...new Set([reference, ...extraReferences].filter(Boolean))]
  const primaryReference = activationReferences[0] || reference

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[activation][retry] attempt ${attempt} for user ${userId}`)

      // Check if already activated (check both collections)
      const earnerSnap = await adminDb.collection('earners').doc(userId).get()
      const advertiserSnap = await adminDb.collection('advertisers').doc(userId).get()
      
      const userDoc = earnerSnap.exists ? earnerSnap : advertiserSnap
      const userType = earnerSnap.exists ? 'earners' : 'advertisers'
      const role: UserRole = userType === 'earners' ? 'earner' : 'advertiser'
      
      if (userDoc.exists && userDoc.data()?.activated) {
        console.log(`[activation][retry] user ${userId} already activated`)
        await markActivationAttemptCompleted({
          userId,
          role,
          provider,
          reference: primaryReference,
          references: activationReferences,
        })
        await processPendingActivationReferrals(adminDb, admin, userId)
        return { success: true, alreadyActivated: true }
      }

      // Store activation reference for webhook processing
      await adminDb.collection(userType).doc(userId).update({
        activationReference: primaryReference,
        activationReferences,
        activationAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
        pendingActivationReference: admin.firestore.FieldValue.delete(),
        pendingActivationReferences: admin.firestore.FieldValue.delete(),
        pendingActivationProvider: admin.firestore.FieldValue.delete(),
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
      await markActivationAttemptCompleted({
        userId,
        role,
        provider,
        reference: primaryReference,
        references: activationReferences,
      })

      // Create activation fee transaction record (platform revenue; not credited to user)
      const collectionName = userType === 'earners' ? 'earnerTransactions' : 'advertiserTransactions'
      await adminDb.collection(collectionName).doc().set({
        userId,
        type: 'activation_fee',
        amount: -2000,
        provider,
        reference: primaryReference,
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

export async function runFullActivationFlow(
  userId: string,
  reference: string,
  provider: string = 'monnify',
  role?: UserRole,
  extraReferences: string[] = []
) {
  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin || !admin) throw new Error('Firebase admin not initialized')

  const adminDb = dbAdmin as AdminFirestore
  const activationReferences = [...new Set([reference, ...extraReferences].filter(Boolean))]
  const primaryReference = activationReferences[0] || reference

  let userType: 'earners' | 'advertisers'
  if (role) {
    userType = role === 'earner' ? 'earners' : 'advertisers'
  } else {
    const [earnerSnap, advertiserSnap] = await Promise.all([
      adminDb.collection('earners').doc(userId).get(),
      adminDb.collection('advertisers').doc(userId).get(),
    ])

    if (earnerSnap.exists) {
      userType = 'earners'
    } else if (advertiserSnap.exists) {
      userType = 'advertisers'
    } else {
      throw new Error(`User not found for activation flow: ${userId}`)
    }
  }

  await adminDb.collection(userType).doc(userId).set({
    pendingActivationReference: primaryReference,
    pendingActivationReferences: activationReferences,
    pendingActivationProvider: provider,
    activationAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })
  await recordActivationAttempt({
    userId,
    role: userType === 'earners' ? 'earner' : 'advertiser',
    provider,
    reference: primaryReference,
    references: activationReferences,
  })

  return processActivationWithRetry(userId, primaryReference, provider, 3, activationReferences)
}

export async function processWalletFundingWithRetry(
  userId: string,
  reference: string,
  amount: number,
  provider: string = 'monnify',
  userType: 'advertiser' | 'earner' = 'advertiser',
  maxRetries: number = 3,
  extraReferences: string[] = []
) {
  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin || !admin) throw new Error('Firebase admin not initialized')

  const adminDb = dbAdmin as AdminFirestore
  const collectionName = userType === 'advertiser' ? 'advertiserTransactions' : 'earnerTransactions'
  const userCollection = userType === 'advertiser' ? 'advertisers' : 'earners'
  const referenceCandidates = normalizeReferenceSet([reference, ...extraReferences])
  const primaryReference = referenceCandidates[0] || String(reference || '').trim()

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[wallet-funding][retry] attempt ${attempt} for ${userType} ${userId}, amount: ${amount}`)

      const userFundingSnap = await adminDb.collection(collectionName)
        .where('userId', '==', userId)
        .where('type', '==', 'wallet_funding')
        .get()

      let existingTxDoc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null = null
      let pendingDoc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null = null

      for (const doc of userFundingSnap.docs) {
        const data = doc.data()
        const docReferences = normalizeReferenceSet([
          data.reference,
          ...(Array.isArray(data.referenceCandidates) ? data.referenceCandidates : []),
        ])

        if (!referencesOverlap(referenceCandidates, docReferences)) continue

        if (String(data.status || '').toLowerCase() === 'completed') {
          existingTxDoc = doc
          break
        }

        if (!pendingDoc && String(data.status || '').toLowerCase() === 'pending') {
          pendingDoc = doc
        }
      }

      if (existingTxDoc) {
        const existingData = existingTxDoc.data()
        const mergedReferences = normalizeReferenceSet([
          existingData.reference,
          ...(Array.isArray(existingData.referenceCandidates) ? existingData.referenceCandidates : []),
          ...referenceCandidates,
        ])

        await existingTxDoc.ref.set({
          provider: existingData.provider || provider,
          reference: String(existingData.reference || primaryReference),
          referenceCandidates: mergedReferences,
          completedAt: existingData.completedAt || admin.firestore.FieldValue.serverTimestamp(),
          recoveryRetryCount: admin.firestore.FieldValue.delete(),
          lastRecoveryCheckedAt: admin.firestore.FieldValue.delete(),
          lastRecoveryVerificationState: admin.firestore.FieldValue.delete(),
          nextRecoveryCheckAt: admin.firestore.FieldValue.delete(),
          recoveryDisposition: admin.firestore.FieldValue.delete(),
          recoveryEscalatedAt: admin.firestore.FieldValue.delete(),
          recoveryEscalationReason: admin.firestore.FieldValue.delete(),
        }, { merge: true })
        console.log(`[wallet-funding][retry] already processed for ${userId}`)
        return { success: true, alreadyProcessed: true }
      }

      let txId = ''
      if (pendingDoc) {
        txId = pendingDoc.id
        const pendingData = pendingDoc.data()
        const mergedReferences = normalizeReferenceSet([
          pendingData.reference,
          ...(Array.isArray(pendingData.referenceCandidates) ? pendingData.referenceCandidates : []),
          ...referenceCandidates,
        ])
        await pendingDoc.ref.update({
          amount,
          provider,
          reference: String(pendingData.reference || primaryReference),
          referenceCandidates: mergedReferences,
          status: 'completed',
          note: `Wallet funded via ${provider}`,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          recoveryRetryCount: admin.firestore.FieldValue.delete(),
          lastRecoveryCheckedAt: admin.firestore.FieldValue.delete(),
          lastRecoveryVerificationState: admin.firestore.FieldValue.delete(),
          nextRecoveryCheckAt: admin.firestore.FieldValue.delete(),
          recoveryDisposition: admin.firestore.FieldValue.delete(),
          recoveryEscalatedAt: admin.firestore.FieldValue.delete(),
          recoveryEscalationReason: admin.firestore.FieldValue.delete(),
        })
      } else {
        const txRef = adminDb.collection(collectionName).doc()
        txId = txRef.id
        await txRef.set({
          userId,
          type: 'wallet_funding',
          amount,
          provider,
          reference: primaryReference,
          referenceCandidates,
          status: 'completed',
          note: `Wallet funded via ${provider}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      }

      // Update balance
      await adminDb.collection(userCollection).doc(userId).update({
        balance: admin.firestore.FieldValue.increment(amount),
      })

      console.log(`[wallet-funding][retry] success for ${userType} ${userId}`)
      return { success: true, attempt, txId }

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
