import type { Firestore as AdminFirestore, Transaction } from 'firebase-admin/firestore'

export const POINTS_REDEEM_MINIMUM = 2500
export const DAILY_LOGIN_POINTS = 10
export const TASK_APPROVAL_POINTS = 10
export const BILL_PAYMENT_POINTS = 5
export const REFERRAL_CREATED_POINTS = 5
export const REFERRAL_ACTIVATED_POINTS = 50
export const HIGH_VALUE_TASK_POINTS = 200
export const HIGH_VALUE_TASK_THRESHOLD = 5000

export type PointsUserCollection = 'earners' | 'advertisers'
export type PointsRedeemTarget = 'wallet' | 'withdraw' | 'bills' | 'tasks'

export type PointsTier = {
  label: string
  threshold: number
  colorClass: string
}

export const POINTS_TIERS: PointsTier[] = [
  { label: 'Bronze star', threshold: 5, colorClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  { label: 'Silver star', threshold: 20, colorClass: 'bg-slate-100 text-slate-700 border-slate-300' },
  { label: 'Gold star', threshold: 50, colorClass: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { label: 'Elite star', threshold: 100, colorClass: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
]

export function getPointsTier(activatedReferralCount: number): PointsTier {
  const count = Number(activatedReferralCount || 0)
  let resolved = POINTS_TIERS[0]
  for (const tier of POINTS_TIERS) {
    if (count >= tier.threshold) {
      resolved = tier
    }
  }
  return resolved
}

export function getPointsStarLabel(activatedReferralCount: number) {
  return getPointsTier(activatedReferralCount).label
}

export function getPointsBadgeClass(activatedReferralCount: number) {
  return getPointsTier(activatedReferralCount).colorClass
}

export function getRedeemablePoints(pointsBalance: number) {
  const balance = Math.max(0, Number(pointsBalance || 0))
  return Math.floor(balance / POINTS_REDEEM_MINIMUM) * POINTS_REDEEM_MINIMUM
}

export function getLagosDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function getPointsEventId(...segments: Array<string | number | null | undefined>) {
  return segments
    .filter((segment) => segment !== null && segment !== undefined && String(segment).trim() !== '')
    .map((segment) => String(segment).trim())
    .join(':')
    .replace(/[^a-zA-Z0-9:_-]/g, '_')
}

type AwardPointsArgs = {
  adminDb: AdminFirestore
  admin: typeof import('firebase-admin')
  transaction: Transaction
  userCollection: PointsUserCollection
  userId: string
  amount: number
  eventId: string
  type: string
  note: string
  referenceId?: string | null
  extraUserUpdates?: Record<string, unknown>
  extraLedgerData?: Record<string, unknown>
}

type RedeemPointsArgs = {
  adminDb: AdminFirestore
  admin: typeof import('firebase-admin')
  transaction: Transaction
  userCollection: PointsUserCollection
  userId: string
  amount: number
  eventId: string
  target: PointsRedeemTarget
  note: string
  extraLedgerData?: Record<string, unknown>
}

function baseUserUpdates(amount: number, eventType: string, note: string, admin: typeof import('firebase-admin')) {
  return {
    pointsBalance: admin.firestore.FieldValue.increment(amount),
    pointsLifetimeEarned: admin.firestore.FieldValue.increment(Math.max(amount, 0)),
    pointsLastEarnedAt: admin.firestore.FieldValue.serverTimestamp(),
    pointsLastEarnedType: eventType,
    pointsLastEarnedNote: note,
    pointsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }
}

export async function awardPointsInTransaction({
  adminDb,
  admin,
  transaction,
  userCollection,
  userId,
  amount,
  eventId,
  type,
  note,
  referenceId,
  extraUserUpdates,
  extraLedgerData,
}: AwardPointsArgs) {
  const safeAmount = Math.floor(Number(amount || 0))
  if (safeAmount <= 0) return false

  const ledgerRef = adminDb.collection('pointsTransactions').doc(eventId)
  const userRef = adminDb.collection(userCollection).doc(userId)

  const [ledgerSnap, userSnap] = await Promise.all([
    transaction.get(ledgerRef),
    transaction.get(userRef),
  ])

  if (ledgerSnap.exists) {
    return false
  }
  if (!userSnap.exists) {
    throw new Error('User not found for points award')
  }

  const currentBalance = Number(userSnap.data()?.pointsBalance || 0)
  transaction.set(ledgerRef, {
    userId,
    userType: userCollection.slice(0, -1),
    amount: safeAmount,
    type,
    note,
    referenceId: referenceId || null,
    balanceBefore: currentBalance,
    balanceAfter: currentBalance + safeAmount,
    status: 'completed',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...extraLedgerData,
  })

  transaction.set(userRef, {
    ...baseUserUpdates(safeAmount, type, note, admin),
    ...(extraUserUpdates || {}),
  }, { merge: true })

  return true
}

export async function awardPointsOnce(args: Omit<AwardPointsArgs, 'transaction'>) {
  return args.adminDb.runTransaction(async (transaction) => {
    return awardPointsInTransaction({
      ...args,
      transaction,
    })
  })
}

export async function redeemPointsInTransaction({
  adminDb,
  admin,
  transaction,
  userCollection,
  userId,
  amount,
  eventId,
  target,
  note,
  extraLedgerData,
}: RedeemPointsArgs) {
  const safeAmount = Math.floor(Number(amount || 0))
  if (safeAmount <= 0) throw new Error('Invalid redemption amount')
  if (safeAmount < POINTS_REDEEM_MINIMUM) throw new Error(`Minimum redemption amount is ${POINTS_REDEEM_MINIMUM} points`)
  if (safeAmount % POINTS_REDEEM_MINIMUM !== 0) {
    throw new Error(`Redemption must be in multiples of ${POINTS_REDEEM_MINIMUM} points`)
  }

  const ledgerRef = adminDb.collection('pointsRedemptions').doc(eventId)
  const userRef = adminDb.collection(userCollection).doc(userId)

  const [ledgerSnap, userSnap] = await Promise.all([
    transaction.get(ledgerRef),
    transaction.get(userRef),
  ])

  if (ledgerSnap.exists) {
    return { duplicate: true as const, balanceAfter: Number(ledgerSnap.data()?.balanceAfter || 0) }
  }
  if (!userSnap.exists) {
    throw new Error('User not found for redemption')
  }

  const currentPoints = Number(userSnap.data()?.pointsBalance || 0)
  if (currentPoints < safeAmount) {
    throw new Error('Insufficient points balance')
  }

  const currentWalletBalance = Number(userSnap.data()?.balance || 0)
  const walletBalanceAfter = currentWalletBalance + safeAmount

  transaction.set(ledgerRef, {
    userId,
    userType: userCollection.slice(0, -1),
    amount: safeAmount,
    target,
    note,
    balanceBefore: currentPoints,
    balanceAfter: currentPoints - safeAmount,
    walletBalanceBefore: currentWalletBalance,
    walletBalanceAfter,
    status: 'completed',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...extraLedgerData,
  })

  transaction.set(userRef, {
    pointsBalance: admin.firestore.FieldValue.increment(-safeAmount),
    pointsRedeemedTotal: admin.firestore.FieldValue.increment(safeAmount),
    pointsLastRedeemedAt: admin.firestore.FieldValue.serverTimestamp(),
    pointsLastRedeemedTarget: target,
    pointsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    balance: admin.firestore.FieldValue.increment(safeAmount),
  }, { merge: true })

  return { duplicate: false as const, balanceAfter: walletBalanceAfter }
}

export function getPointsUserCollection(role: 'earner' | 'advertiser'): PointsUserCollection {
  return role === 'earner' ? 'earners' : 'advertisers'
}
