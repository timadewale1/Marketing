import { FieldValue, type Firestore as AdminFirestore, type Transaction } from 'firebase-admin/firestore'

import {
  REFERRAL_WEEKLY_STATS_COLLECTION,
  REFERRAL_WEEKLY_REWARD_POINTS,
  getCurrentLagosWeekKey,
  getReferralWeeklyStatId,
  getReferralTierFromCount,
  type ReferralRole,
} from './referral-weekly'
import { awardPointsInTransaction, getPointsEventId } from './points'

const REFERRAL_WEEKLY_REWARD_FIELD_BY_TIER = {
  bronze: 'bronzeReferralRewardGrantedAt',
  silver: 'silverReferralRewardGrantedAt',
  gold: 'goldReferralRewardGrantedAt',
  elite: 'eliteReferralRewardGrantedAt',
} as const

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
  admin,
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
  admin: typeof import('firebase-admin')
  role: ReferralRole
  userId: string
  name?: string | null
  email?: string | null
  referredId?: string | null
  referralId?: string | null
  weekKey?: string
}) {
  const statRef = getReferralWeeklyStatDocRef(adminDb, role, userId, weekKey)
  const statSnap = await transaction.get(statRef)
  const currentCount = Number(statSnap.data()?.weeklyActivatedReferrals || 0)
  const nextCount = currentCount + 1
  const tier = getReferralTierFromCount(nextCount)
  const rewardField = tier ? REFERRAL_WEEKLY_REWARD_FIELD_BY_TIER[tier] : null
  const rewardAlreadyGranted = rewardField ? Boolean(statSnap.data()?.[rewardField]) : false

  if (tier && !rewardAlreadyGranted) {
    await awardPointsInTransaction({
      adminDb,
      admin,
      transaction,
      userCollection: role === 'earner' ? 'earners' : 'advertisers',
      userId,
      amount: REFERRAL_WEEKLY_REWARD_POINTS[tier],
      eventId: getPointsEventId('referral-weekly-reward', weekKey, role, userId, tier),
      type: 'referral_weekly_reward',
      note: `Weekly referral reward for reaching ${tier} tier`,
      referenceId: referredId || null,
      extraUserUpdates: {
        pointsWeeklyReferralRewardTotal: FieldValue.increment(REFERRAL_WEEKLY_REWARD_POINTS[tier]),
        pointsLastWeeklyReferralRewardAt: FieldValue.serverTimestamp(),
        pointsLastWeeklyReferralRewardTier: tier,
      },
      extraLedgerData: {
        weekKey,
        tier,
        weeklyActivatedReferrals: nextCount,
      },
    })
  }

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
      ...(tier && !rewardAlreadyGranted ? { [rewardField!]: FieldValue.serverTimestamp() } : {}),
    },
    { merge: true }
  )
}
