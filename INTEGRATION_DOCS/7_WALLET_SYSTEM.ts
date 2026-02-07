/**
 * WALLET MANAGEMENT SYSTEM
 * 
 * Handles wallet balance tracking and reserved funds for users.
 * Supports advertiser and earner wallets with transaction recording.
 * 
 * Database Structure (Firestore):
 * - advertisers/{userId}
 *   - balance: number (available funds in Naira)
 *   - reserved: number (funds held for pending transactions)
 *   - lastUpdated: timestamp
 * 
 * - earners/{userId}
 *   - balance: number (available funds in Naira)
 *   - reserved: number (funds held for pending transactions)
 *   - lastUpdated: timestamp
 */

import admin from 'firebase-admin'

export type UserType = 'advertiser' | 'earner'

export interface WalletData {
  balance: number
  reserved?: number
  lastUpdated?: admin.firestore.Timestamp
  totalEarnings?: number
  totalWithdrawn?: number
}

export interface WalletTransaction {
  id?: string
  userId: string
  type: 'deposit' | 'withdrawal' | 'reserve' | 'release' | 'debit'
  amount: number
  reference?: string
  provider?: 'paystack' | 'monnify'
  description: string
  status: 'pending' | 'completed' | 'failed'
  timestamp: admin.firestore.Timestamp
  metadata?: Record<string, unknown>
}

/**
 * Get user wallet balance
 */
export async function getWalletBalance(userId: string, userType: UserType): Promise<number> {
  try {
    const userRef = admin.firestore().collection(userType === 'advertiser' ? 'advertisers' : 'earners').doc(userId)
    const snap = await userRef.get()

    if (!snap.exists) {
      console.warn(`User ${userType} ${userId} wallet not found`)
      return 0
    }

    return Number(snap.data()?.balance || 0)
  } catch (err) {
    console.error('Error fetching wallet balance:', err)
    throw err
  }
}

/**
 * Increment wallet balance (fund wallet)
 * This is called after payment verification
 */
export async function incrementWalletBalance(
  userId: string,
  userType: UserType,
  amount: number,
  transactionReference: string,
  provider: 'paystack' | 'monnify'
): Promise<void> {
  const db = admin.firestore()
  const userRef = db.collection(userType === 'advertiser' ? 'advertisers' : 'earners').doc(userId)

  const transaction = db.runTransaction(async (t) => {
    // Get current balance
    const userSnap = await t.get(userRef)

    if (!userSnap.exists) {
      throw new Error(`User ${userType} ${userId} not found`)
    }

    const currentBalance = Number(userSnap.data()?.balance || 0)

    // Increment balance by verified amount
    t.update(userRef, {
      balance: admin.firestore.FieldValue.increment(amount),
      lastUpdated: admin.firestore.Timestamp.now(),
    })

    // Record transaction
    const transactionRef = db.collection(`${userType}Transactions`).doc()
    t.set(transactionRef, {
      userId,
      type: 'deposit',
      amount,
      reference: transactionReference,
      provider,
      description: `Wallet funded via ${provider}`,
      status: 'completed',
      timestamp: admin.firestore.Timestamp.now(),
      previousBalance: currentBalance,
      newBalance: currentBalance + amount,
    })
  })

  await transaction
}

/**
 * Deduct funds from wallet (bill payment, etc)
 * Checks sufficient balance before deducting
 */
export async function deductWalletBalance(
  userId: string,
  userType: UserType,
  amount: number,
  description: string
): Promise<void> {
  const db = admin.firestore()
  const userRef = db.collection(userType === 'advertiser' ? 'advertisers' : 'earners').doc(userId)

  const transaction = db.runTransaction(async (t) => {
    // Get current balance
    const userSnap = await t.get(userRef)

    if (!userSnap.exists) {
      throw new Error(`User ${userType} ${userId} not found`)
    }

    const currentBalance = Number(userSnap.data()?.balance || 0)

    // Check sufficient balance
    if (currentBalance < amount) {
      throw new Error(`Insufficient balance. Have: ₦${currentBalance}, Need: ₦${amount}`)
    }

    // Deduct amount
    t.update(userRef, {
      balance: admin.firestore.FieldValue.increment(-amount),
      lastUpdated: admin.firestore.Timestamp.now(),
    })

    // Record transaction
    const transactionRef = db.collection(`${userType}Transactions`).doc()
    t.set(transactionRef, {
      userId,
      type: 'debit',
      amount,
      description,
      status: 'completed',
      timestamp: admin.firestore.Timestamp.now(),
      previousBalance: currentBalance,
      newBalance: currentBalance - amount,
    })
  })

  await transaction
}

/**
 * Reserve funds for pending transaction
 * Prevents user from withdrawing funds that are in use
 */
export async function reserveWalletFunds(
  userId: string,
  userType: UserType,
  amount: number,
  reason: string
): Promise<void> {
  const db = admin.firestore()
  const userRef = db.collection(userType === 'advertiser' ? 'advertisers' : 'earners').doc(userId)

  const transaction = db.runTransaction(async (t) => {
    const userSnap = await t.get(userRef)
    if (!userSnap.exists) {
      throw new Error(`User ${userType} ${userId} not found`)
    }

    const currentBalance = Number(userSnap.data()?.balance || 0)
    const reserved = Number(userSnap.data()?.reserved || 0)

    // Check sufficient available balance
    if (currentBalance - reserved < amount) {
      throw new Error('Insufficient available balance')
    }

    // Add to reserved amount
    t.update(userRef, {
      reserved: admin.firestore.FieldValue.increment(amount),
    })

    // Record transaction
    const txnRef = db.collection(`${userType}Transactions`).doc()
    t.set(txnRef, {
      userId,
      type: 'reserve',
      amount,
      description: reason,
      status: 'pending',
      timestamp: admin.firestore.Timestamp.now(),
    })
  })

  await transaction
}

/**
 * Release reserved funds back to available balance
 * Called when transaction fails or is cancelled
 */
export async function releaseReservedFunds(
  userId: string,
  userType: UserType,
  amount: number,
  reason: string
): Promise<void> {
  const db = admin.firestore()
  const userRef = db.collection(userType === 'advertiser' ? 'advertisers' : 'earners').doc(userId)

  const transaction = db.runTransaction(async (t) => {
    const userSnap = await t.get(userRef)
    if (!userSnap.exists) {
      throw new Error(`User ${userType} ${userId} not found`)
    }

    const reserved = Number(userSnap.data()?.reserved || 0)

    if (reserved < amount) {
      console.warn(`Cannot release ₦${amount}, only ₦${reserved} reserved`)
      return
    }

    // Subtract from reserved amount
    t.update(userRef, {
      reserved: admin.firestore.FieldValue.increment(-amount),
    })

    // Record transaction
    const txnRef = db.collection(`${userType}Transactions`).doc()
    t.set(txnRef, {
      userId,
      type: 'release',
      amount,
      description: reason,
      status: 'completed',
      timestamp: admin.firestore.Timestamp.now(),
    })
  })

  await transaction
}

/**
 * Get wallet transactions for user
 */
export async function getWalletTransactions(
  userId: string,
  userType: UserType,
  limit: number = 50
): Promise<WalletTransaction[]> {
  try {
    const collectionName = userType === 'advertiser' ? 'advertiserTransactions' : 'earnerTransactions'

    const snapshot = await admin
      .firestore()
      .collection(collectionName)
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get()

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as WalletTransaction[]
  } catch (err) {
    console.error('Error fetching wallet transactions:', err)
    return []
  }
}

/**
 * Calculate wallet statistics
 */
export async function getWalletStats(userId: string, userType: UserType) {
  try {
    const transactions = await getWalletTransactions(userId, userType, 1000)

    const stats = {
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalDebits: 0,
      transactionCount: transactions.length,
      lastTransaction: transactions[0] ? transactions[0].timestamp : null,
    }

    transactions.forEach((txn) => {
      if (txn.type === 'deposit') stats.totalDeposits += txn.amount
      if (txn.type === 'withdrawal') stats.totalWithdrawals += txn.amount
      if (txn.type === 'debit') stats.totalDebits += txn.amount
    })

    return stats
  } catch (err) {
    console.error('Error calculating wallet stats:', err)
    return null
  }
}
