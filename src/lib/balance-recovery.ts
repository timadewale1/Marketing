import type { Firestore, Transaction } from "firebase-admin/firestore"
import type { FirebaseAdminCompat } from "@/lib/firebase-admin-compat"

type UserCollection = "earners" | "advertisers"

type CreditRecoveryOptions = {
  adminDb: Firestore
  admin: FirebaseAdminCompat
  transaction: Transaction
  userCollection: UserCollection
  userId: string
  amount: number
  transactionCollection?: "earnerTransactions" | "advertiserTransactions"
  recoveryNote?: string
  transactionType?: string
  transactionExtras?: Record<string, unknown>
}

type DebitRecoveryOptions = {
  adminDb: Firestore
  admin: FirebaseAdminCompat
  transaction: Transaction
  userCollection: UserCollection
  userId: string
  amount: number
  transactionCollection?: "earnerTransactions" | "advertiserTransactions"
  recoveryNote?: string
  transactionType?: string
  transactionExtras?: Record<string, unknown>
}

function normalizeAmount(value: unknown) {
  const amount = Math.floor(Number(value || 0))
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

function getUserRef(adminDb: Firestore, userCollection: UserCollection, userId: string) {
  return adminDb.collection(userCollection).doc(userId)
}

export async function applyRecoveryAwareCreditInTransaction({
  adminDb,
  admin,
  transaction,
  userCollection,
  userId,
  amount,
  transactionCollection,
  recoveryNote,
  transactionType,
  transactionExtras,
}: CreditRecoveryOptions) {
  const normalizedAmount = normalizeAmount(amount)
  if (normalizedAmount <= 0) {
    return { netCredited: 0, offsetApplied: 0, remainingDebt: 0 }
  }

  const userRef = getUserRef(adminDb, userCollection, userId)
  const snap = await transaction.get(userRef)
  if (!snap.exists) {
    throw new Error(`User not found while applying recovery-aware credit: ${userId}`)
  }

  const data = snap.data() || {}
  const pendingRecovery = Math.max(0, Number(data.pendingBalanceRecovery || 0))
  const offsetApplied = Math.min(pendingRecovery, normalizedAmount)
  const netCredited = normalizedAmount - offsetApplied
  const remainingDebt = Math.max(0, pendingRecovery - offsetApplied)
  const timestamp = admin.firestore.FieldValue.serverTimestamp()

  if (offsetApplied > 0 && transactionCollection) {
    transaction.set(adminDb.collection(transactionCollection).doc(), {
      userId,
      type: transactionType || "balance_recovery_deduction",
      amount: -offsetApplied,
      status: "completed",
      note: recoveryNote || "Automatic recovery deduction from a previous reversal",
      createdAt: timestamp,
      recoveredAmount: offsetApplied,
      source: "balance_recovery",
      ...transactionExtras,
    })
  }

  const updates: Record<string, unknown> = {
    updatedAt: timestamp,
  }

  if (netCredited > 0) {
    updates.balance = admin.firestore.FieldValue.increment(netCredited)
  }

  if (remainingDebt > 0) {
    updates.pendingBalanceRecovery = remainingDebt
    updates.pendingBalanceRecoveryUpdatedAt = timestamp
  } else if (pendingRecovery > 0) {
    updates.pendingBalanceRecovery = admin.firestore.FieldValue.delete()
    updates.pendingBalanceRecoveryUpdatedAt = admin.firestore.FieldValue.delete()
  }

  if (Object.keys(updates).length > 0) {
    transaction.update(userRef, updates)
  }

  return { netCredited, offsetApplied, remainingDebt }
}

export async function applyRecoveryAwareDebitInTransaction({
  adminDb,
  admin,
  transaction,
  userCollection,
  userId,
  amount,
  transactionCollection,
  recoveryNote,
  transactionType,
  transactionExtras,
}: DebitRecoveryOptions) {
  const normalizedAmount = normalizeAmount(amount)
  if (normalizedAmount <= 0) {
    return { deductedNow: 0, addedDebt: 0, remainingDebt: 0 }
  }

  const userRef = getUserRef(adminDb, userCollection, userId)
  const snap = await transaction.get(userRef)
  if (!snap.exists) {
    throw new Error(`User not found while applying recovery-aware debit: ${userId}`)
  }

  const data = snap.data() || {}
  const currentBalance = Math.max(0, Number(data.balance || 0))
  const pendingRecovery = Math.max(0, Number(data.pendingBalanceRecovery || 0))
  const deductedNow = Math.min(currentBalance, normalizedAmount)
  const addedDebt = Math.max(0, normalizedAmount - deductedNow)
  const remainingDebt = pendingRecovery + addedDebt
  const timestamp = admin.firestore.FieldValue.serverTimestamp()

  if (deductedNow > 0 && transactionCollection) {
    transaction.set(adminDb.collection(transactionCollection).doc(), {
      userId,
      type: transactionType || "balance_recovery_reversal",
      amount: -deductedNow,
      status: "completed",
      note: recoveryNote || "Balance reversal applied",
      createdAt: timestamp,
      recoveredAmount: deductedNow,
      source: "balance_recovery",
      ...transactionExtras,
    })
  }

  const updates: Record<string, unknown> = {
    updatedAt: timestamp,
  }

  if (deductedNow > 0) {
    updates.balance = admin.firestore.FieldValue.increment(-deductedNow)
  }

  if (remainingDebt > 0) {
    updates.pendingBalanceRecovery = remainingDebt
    updates.pendingBalanceRecoveryUpdatedAt = timestamp
  } else if (pendingRecovery > 0) {
    updates.pendingBalanceRecovery = admin.firestore.FieldValue.delete()
    updates.pendingBalanceRecoveryUpdatedAt = admin.firestore.FieldValue.delete()
  }

  if (Object.keys(updates).length > 0) {
    transaction.update(userRef, updates)
  }

  return { deductedNow, addedDebt, remainingDebt }
}
