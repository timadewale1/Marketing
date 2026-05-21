import { FieldValue, type Firestore as AdminFirestore, type Transaction } from 'firebase-admin/firestore'

export type ReferralRole = 'earner' | 'advertiser'

export type ReferralTier = 'bronze' | 'silver' | 'gold' | 'elite'

export type WeeklyReferralStat = {
  id: string
  userId: string
  role: ReferralRole
  name?: string
  email?: string
  weekKey: string
  weeklyActivatedReferrals: number
  updatedAt?: unknown
}

export const REFERRAL_WEEKLY_STATS_COLLECTION = 'referralWeeklyStats'

const DAY_MS = 24 * 60 * 60 * 1000

function toLagosDateParts(date: Date = new Date()) {
  const lagos = new Date(date.getTime() + 60 * 60 * 1000)
  return {
    year: lagos.getUTCFullYear(),
    month: lagos.getUTCMonth(),
    date: lagos.getUTCDate(),
    day: lagos.getUTCDay(),
  }
}

export function getCurrentLagosWeekStart(date: Date = new Date()) {
  const parts = toLagosDateParts(date)
  const daysSinceMonday = (parts.day + 6) % 7
  const mondayUtc = Date.UTC(parts.year, parts.month, parts.date - daysSinceMonday)
  return new Date(mondayUtc)
}

export function getCurrentLagosWeekKey(date: Date = new Date()) {
  const start = getCurrentLagosWeekStart(date)
  return [
    start.getUTCFullYear(),
    String(start.getUTCMonth() + 1).padStart(2, '0'),
    String(start.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

export function getReferralTierFromCount(count: number): ReferralTier | null {
  if (count >= 100) return 'elite'
  if (count >= 50) return 'gold'
  if (count >= 20) return 'silver'
  if (count >= 5) return 'bronze'
  return null
}

export function getReferralTierLabel(tier: ReferralTier | null) {
  if (tier === 'bronze') return 'Bronze Star'
  if (tier === 'silver') return 'Silver Star'
  if (tier === 'gold') return 'Gold Star'
  if (tier === 'elite') return 'Elite Stars'
  return 'No star yet'
}

export function getReferralTierOrder(tier: ReferralTier | null) {
  if (tier === 'bronze') return 1
  if (tier === 'silver') return 2
  if (tier === 'gold') return 3
  if (tier === 'elite') return 4
  return 0
}

export function getReferralTierDescription(tier: ReferralTier | null) {
  if (tier === 'bronze') return '5-19 activated referrals this week'
  if (tier === 'silver') return '20-49 activated referrals this week'
  if (tier === 'gold') return '50-99 activated referrals this week'
  if (tier === 'elite') return '100+ activated referrals this week'
  return 'Less than 5 activated referrals this week'
}

export function getReferralWeeklyStatId(role: ReferralRole, userId: string, weekKey: string) {
  return `${weekKey}_${role}_${userId}`
}

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

export function getReferralWeekWindowLabel(date: Date = new Date()) {
  const start = getCurrentLagosWeekStart(date)
  const end = new Date(start.getTime() + 7 * DAY_MS - 1)
  return {
    start,
    end,
    label: `${start.toLocaleDateString('en-NG')} - ${end.toLocaleDateString('en-NG')}`,
  }
}
