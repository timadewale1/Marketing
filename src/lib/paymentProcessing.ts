// Payment processing utilities for reliable activation and wallet funding
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { markActivationAttemptCompleted, recordActivationAttempt } from '@/lib/activation-attempts'
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore'
import { REFERRAL_ACTIVATED_POINTS, awardPointsInTransaction, getPointsEventId } from '@/lib/points'
import { recordWeeklyReferralActivationInTransaction } from '@/lib/referral-weekly.server'
import { getAdvertiserTaskReferralBonusAmount, getAdvertiserTaskReferralLabel, getReferralActivationBonusAmount } from '@/lib/referral-rewards'
import { applyRecoveryAwareCreditInTransaction } from '@/lib/balance-recovery'
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
  // Query by referred user only, then filter in-memory so we don't miss
  // legacy/inconsistent docs where status/bonus flags were not updated cleanly.
  const refsSnap = await adminDb.collection('referrals')
    .where('referredId', '==', userId)
    .limit(50)
    .get()

  const referralDocs = refsSnap.docs.filter((doc) => {
    const data = doc.data() as {
      bonusPaid?: boolean
      condition?: string
    }
    if (data.bonusPaid === true) return false
    const condition = String(data.condition || 'activation').toLowerCase()
    if (condition !== 'activation') return false
    return true
  })

  console.log(`[activation][retry] processing ${referralDocs.length} referrals for ${userId}`)

  for (const rDoc of referralDocs) {
    const referral = rDoc.data() as {
      amount?: number | string
      referrerId?: string
    }
    const rawBonus = Number(referral.amount || 0)
    const bonus = rawBonus > 0 ? rawBonus : getReferralActivationBonusAmount()
    const referrerId = String(referral.referrerId || '').trim()
    if (!referrerId || bonus <= 0) continue

    try {
      let processed = false
      let lastError: unknown = null
      for (let attempt = 1; attempt <= 3 && !processed; attempt += 1) {
        try {
          await adminDb.runTransaction(async (t) => {
            const referralRef = adminDb.collection('referrals').doc(rDoc.id)
            const snap = await t.get(referralRef)
            const referralData = snap.data() as { status?: string; bonusPaid?: boolean } | undefined
            if (!snap.exists || referralData?.bonusPaid === true) {
              processed = true
              return
            }

            const advRef = adminDb.collection('advertisers').doc(referrerId)
            const earnerRef = adminDb.collection('earners').doc(referrerId)
            const [advSnap, earnerSnap] = await Promise.all([t.get(advRef), t.get(earnerRef)])
            const referrerCollection = advSnap.exists ? 'advertisers' : earnerSnap.exists ? 'earners' : null
            if (!referrerCollection) {
              processed = true
              return
            }

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

            const referrerTxCollection = referrerCollection === 'advertisers' ? 'advertiserTransactions' : 'earnerTransactions'
            const recoveryResult = await applyRecoveryAwareCreditInTransaction({
              adminDb,
              admin,
              transaction: t,
              userCollection: referrerCollection,
              userId: referrerId,
              amount: bonus,
              transactionCollection: referrerTxCollection,
              recoveryNote: `Automatic recovery deduction from a previous reversal`,
              transactionType: 'balance_recovery_deduction',
              transactionExtras: {
                referralId: rDoc.id,
                referredUserId: userId,
              },
            })

            t.set(adminDb.collection(referrerTxCollection).doc(), {
              userId: referrerId,
              type: 'referral_bonus',
              amount: bonus,
              netAmount: recoveryResult.netCredited,
              recoveryOffsetApplied: recoveryResult.offsetApplied,
              status: 'completed',
              note: `Referral bonus for referring ${userId}`,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              referralId: rDoc.id,
              referredUserId: userId,
            })
          })
          processed = true
        } catch (error) {
          lastError = error
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 500))
          }
        }
      }
      if (!processed && lastError) {
        throw lastError
      }

      await adminDb.runTransaction(async (weeklyTransaction) => {
        const weeklyAdvRef = adminDb.collection('advertisers').doc(referrerId)
        const weeklyEarnerRef = adminDb.collection('earners').doc(referrerId)
        const [weeklyAdvSnap, weeklyEarnerSnap] = await Promise.all([
          weeklyTransaction.get(weeklyAdvRef),
          weeklyTransaction.get(weeklyEarnerRef),
        ])
        if (!weeklyAdvSnap.exists && !weeklyEarnerSnap.exists) return
        const weeklyRole = weeklyAdvSnap.exists ? 'advertiser' : 'earner'
        const weeklyReferrerData = (weeklyAdvSnap.exists ? weeklyAdvSnap.data() : weeklyEarnerSnap.data()) as
          | { fullName?: string; name?: string; businessName?: string; companyName?: string; email?: string }
          | undefined
        await recordWeeklyReferralActivationInTransaction({
          adminDb,
          transaction: weeklyTransaction,
          role: weeklyRole,
          userId: referrerId,
          name: String(
            weeklyReferrerData?.fullName ||
              weeklyReferrerData?.name ||
              weeklyReferrerData?.businessName ||
              weeklyReferrerData?.companyName ||
              weeklyReferrerData?.email ||
              ''
          ).trim(),
          email: weeklyReferrerData?.email || null,
          referredId: userId,
          referralId: rDoc.id,
        })
      })
    } catch (e) {
      console.error(`[activation][retry] failed processing referral ${rDoc.id}:`, e)
    }
  }
}

export async function awardAdvertiserFirstTaskReferralBonusInTransaction(
  adminDb: AdminFirestore,
  admin: typeof import('firebase-admin'),
  transaction: FirebaseFirestore.Transaction,
  advertiserId: string,
  campaignId: string,
  campaignBudget: number,
  campaignTitle?: string | null
) {
  const safeBudget = Math.max(0, Math.floor(Number(campaignBudget || 0)))
  const bonusAmount = getAdvertiserTaskReferralBonusAmount(safeBudget)
  if (!advertiserId || bonusAmount <= 0) {
    return { awarded: false, bonusAmount: 0, referralId: null as string | null }
  }

  const advertiserRef = adminDb.collection('advertisers').doc(advertiserId)
  const advertiserSnap = await transaction.get(advertiserRef)
  if (!advertiserSnap.exists) {
    return { awarded: false, bonusAmount, referralId: null as string | null }
  }

  const referralQuery = adminDb
    .collection('referrals')
    .where('referredId', '==', advertiserId)
    .where('userType', '==', 'advertiser')
    .limit(1)

  const referralSnap = await transaction.get(referralQuery)
  if (referralSnap.empty) {
    return { awarded: false, bonusAmount, referralId: null as string | null }
  }

  const referralDoc = referralSnap.docs[0]
  const referral = referralDoc.data() as {
    referrerId?: string
  }

  const referrerId = String(referral.referrerId || '').trim()
  if (!referrerId) {
    return { awarded: false, bonusAmount, referralId: referralDoc.id }
  }

  const referrerEarnerRef = adminDb.collection('earners').doc(referrerId)
  const referrerAdvertiserRef = adminDb.collection('advertisers').doc(referrerId)
  const [referrerEarnerSnap, referrerAdvertiserSnap] = await Promise.all([
    transaction.get(referrerEarnerRef),
    transaction.get(referrerAdvertiserRef),
  ])

  const referrerCollection = referrerAdvertiserSnap.exists ? 'advertisers' : referrerEarnerSnap.exists ? 'earners' : null
  if (!referrerCollection) {
    return { awarded: false, bonusAmount, referralId: referralDoc.id }
  }

  const referrerTransactionRef = adminDb.collection(
    referrerCollection === 'advertisers' ? 'advertiserTransactions' : 'earnerTransactions'
  ).doc(getPointsEventId('referral-first-task', referralDoc.id, campaignId))
  const existingTxSnap = await transaction.get(referrerTransactionRef)
  if (existingTxSnap.exists) {
    return { awarded: false, bonusAmount, referralId: referralDoc.id }
  }

  const recoveryResult = await applyRecoveryAwareCreditInTransaction({
    adminDb,
    admin,
    transaction,
    userCollection: referrerCollection,
    userId: referrerId,
    amount: bonusAmount,
    transactionCollection: referrerCollection === 'advertisers' ? 'advertiserTransactions' : 'earnerTransactions',
    recoveryNote: `Automatic recovery deduction from a previous reversal`,
    transactionType: 'balance_recovery_deduction',
    transactionExtras: {
      referralId: referralDoc.id,
      campaignId,
    },
  })

  transaction.set(referrerTransactionRef, {
    userId: referrerId,
    type: 'referral_bonus',
    amount: bonusAmount,
    netAmount: recoveryResult.netCredited,
    recoveryOffsetApplied: recoveryResult.offsetApplied,
    status: 'completed',
    note: `${getAdvertiserTaskReferralLabel()} bonus from a task created by referred advertiser ${advertiserId}${campaignTitle ? ` for ${campaignTitle}` : ''}`,
    campaignId,
    referralId: referralDoc.id,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  return { awarded: true, bonusAmount, referralId: referralDoc.id }
}

export async function processActivationWithRetry(
  userId: string,
  reference: string,
  provider: string = 'monnify',
  maxRetries: number = 3,
  extraReferences: string[] = [],
  activationPaymentAmount = 2000
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

      const activationFeeAmount = 2000
      const normalizedPaidAmount = Math.max(0, Math.min(activationFeeAmount, Math.floor(Number(activationPaymentAmount || 0))))
      const userBalanceBeforeActivation = Number(userDoc.data()?.balance || 0)
      const walletOffsetAmount = Math.min(
        userBalanceBeforeActivation,
        Math.max(0, activationFeeAmount - normalizedPaidAmount)
      )
      const walletOffsetBalanceAfter = userBalanceBeforeActivation - walletOffsetAmount

      if (walletOffsetAmount > 0) {
        await adminDb.collection(userType).doc(userId).set({
          balance: walletOffsetBalanceAfter,
          activationWalletOffsetAmount: walletOffsetAmount,
          activationWalletOffsetAt: admin.firestore.FieldValue.serverTimestamp(),
          activationPaymentAmount: normalizedPaidAmount,
          activationFeeAmount,
        }, { merge: true })
      }

      // Create membership fee transaction record (platform revenue; not credited to user)
      const collectionName = userType === 'earners' ? 'earnerTransactions' : 'advertiserTransactions'
      await adminDb.collection(collectionName).doc().set({
        userId,
        type: 'activation_fee',
        amount: -activationFeeAmount,
        paidAmount: normalizedPaidAmount,
        walletOffsetAmount,
        activationFeeAmount,
        provider,
        reference: primaryReference,
        status: 'completed',
        note: `Membership fee payment`,
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
  extraReferences: string[] = [],
  activationPaymentAmount = 2000
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

  return processActivationWithRetry(userId, primaryReference, provider, 3, activationReferences, activationPaymentAmount)
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

      const matchingDocs: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[] = []
      const completedDocs: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[] = []
      const pendingDocs: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[] = []

      for (const doc of userFundingSnap.docs) {
        const data = doc.data()
        const docReferences = normalizeReferenceSet([
          data.reference,
          ...(Array.isArray(data.referenceCandidates) ? data.referenceCandidates : []),
        ])

        if (!referencesOverlap(referenceCandidates, docReferences)) continue

        matchingDocs.push(doc)
        if (String(data.status || '').toLowerCase() === 'completed') {
          completedDocs.push(doc)
        } else if (String(data.status || '').toLowerCase() === 'pending') {
          pendingDocs.push(doc)
        }
      }

      if (matchingDocs.length === 0) {
        const txRef = adminDb.collection(collectionName).doc()
        const txId = txRef.id
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

        await adminDb.collection(userCollection).doc(userId).update({
          balance: admin.firestore.FieldValue.increment(amount),
        })

        console.log(`[wallet-funding][retry] success for ${userType} ${userId}`)
        return { success: true, attempt, txId }
      }

      const mergedReferences = normalizeReferenceSet([
        ...matchingDocs.flatMap((doc) => {
          const data = doc.data()
          return [
            data.reference,
            ...(Array.isArray(data.referenceCandidates) ? data.referenceCandidates : []),
          ]
        }),
        ...referenceCandidates,
      ])

      const primaryPendingDoc = pendingDocs.find((doc) => Number(doc.data().amount || 0) === amount) || pendingDocs[0] || null
      const primaryCompletedDoc = completedDocs[0] || null

      if (primaryCompletedDoc) {
        const existingData = primaryCompletedDoc.data()
        await primaryCompletedDoc.ref.set({
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
          recoveryAutoChecksLocked: admin.firestore.FieldValue.delete(),
        }, { merge: true })
      }

      const docsToClose = pendingDocs.filter((doc) => !primaryCompletedDoc || doc.id !== primaryCompletedDoc.id)
      if (primaryPendingDoc && !primaryCompletedDoc) {
        const primaryData = primaryPendingDoc.data()
        await primaryPendingDoc.ref.update({
          amount,
          provider,
          reference: String(primaryData.reference || primaryReference),
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
          recoveryAutoChecksLocked: admin.firestore.FieldValue.delete(),
        })
      }

      for (const duplicateDoc of docsToClose) {
        const duplicateData = duplicateDoc.data()
        await duplicateDoc.ref.set({
          provider: duplicateData.provider || provider,
          reference: String(duplicateData.reference || primaryReference),
          referenceCandidates: mergedReferences,
          status: 'completed',
          note: 'Duplicate wallet funding record reconciled',
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          recoveryRetryCount: admin.firestore.FieldValue.delete(),
          lastRecoveryCheckedAt: admin.firestore.FieldValue.delete(),
          lastRecoveryVerificationState: admin.firestore.FieldValue.delete(),
          nextRecoveryCheckAt: admin.firestore.FieldValue.delete(),
          recoveryDisposition: admin.firestore.FieldValue.delete(),
          recoveryEscalatedAt: admin.firestore.FieldValue.delete(),
          recoveryEscalationReason: admin.firestore.FieldValue.delete(),
          recoveryAutoChecksLocked: admin.firestore.FieldValue.delete(),
        }, { merge: true })
      }

      if (!primaryCompletedDoc) {
        await adminDb.runTransaction(async (t) => {
          await applyRecoveryAwareCreditInTransaction({
            adminDb,
            admin,
            transaction: t,
            userCollection,
            userId,
            amount,
            transactionCollection: collectionName,
            recoveryNote: `Automatic recovery deduction from a previous reversal`,
            transactionType: 'balance_recovery_deduction',
            transactionExtras: {
              reference: primaryReference,
            },
          })
        })
      }

      const txId = primaryPendingDoc?.id || primaryCompletedDoc?.id || matchingDocs[0].id
      console.log(`[wallet-funding][retry] success for ${userType} ${userId}, reconciled ${Math.max(0, docsToClose.length)} duplicate(s)`)
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
