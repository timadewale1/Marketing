import { FieldValue, type Firestore as AdminFirestore, type Transaction } from 'firebase-admin/firestore'

import {
  REFERRAL_WEEKLY_STATS_COLLECTION,
  getCurrentLagosWeekKey,
  getReferralWeeklyStatId,
  type ReferralRole,
} from './referral-weekly'

export function getReferralWeeklyStatDocRef(
  adminDb: AdminFirestore,
  role: ReferralRole,
  userId: string,
  weekKey: string
) {
  return adminDb.collection(REFERRAL_WEEKLY_STATS_COLLECTION).doc(getReferralWeeklyStatId(role, userId, weekKey))
}

export async function recordWeeklyReferralActivationInTransaction({
  adminDb,
  transaction,
  role,
  userId,
  name,
  email,
  referredId,
  referralId,
  weekKey = getCurrentLagosWeekKey(),
}: {
  adminDb: AdminFirestore
  transaction: Transaction
  role: ReferralRole
  userId: string
  name?: string | null
  email?: string | null
  referredId?: string | null
  referralId?: string | null
  weekKey?: string
}) {
  const statRef = getReferralWeeklyStatDocRef(adminDb, role, userId, weekKey)
  transaction.set(
    statRef,
    {
      userId,
      role,
      name: name || null,
      email: email || null,
      weekKey,
      weeklyActivatedReferrals: FieldValue.increment(1),
      lastActivatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastReferredUserId: referredId || null,
      lastReferralId: referralId || null,
    },
    { merge: true }
  )
}
