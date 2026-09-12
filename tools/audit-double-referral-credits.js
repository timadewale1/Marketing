const admin = require('firebase-admin')
const fs = require('fs')
const path = require('path')

function loadServiceAccount() {
  const envPath = path.join(__dirname, '..', '.env')
  const env = fs.readFileSync(envPath, 'utf8')
  const match = env.match(/^FIREBASE_SERVICE_ACCOUNT_KEY=(.*(?:\r?\n(?![A-Z_0-9]+=).*)*)$/m)
  if (!match) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is missing from .env')
  return JSON.parse(match[1].trim())
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(loadServiceAccount()),
    databaseURL: 'https://blessing-636ca.firebaseio.com',
  })
}

const db = admin.firestore()
const APPLY = process.argv.includes('--apply')
const RECOVERY_EMAIL = 'successchikeawele@gmail.com'
const RECOVERY_AMOUNT = 4000

function number(value) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function timestampValue(value) {
  if (!value) return 0
  if (typeof value.toMillis === 'function') return value.toMillis()
  if (value._seconds) return value._seconds * 1000
  return new Date(value).getTime() || 0
}

async function readTransactions(collectionName) {
  const snap = await db.collection(collectionName).get()
  return snap.docs.map((doc) => ({ id: doc.id, ref: doc.ref, data: doc.data() }))
}

async function readReferral(referralId) {
  if (!referralId) return null
  const snap = await db.collection('referrals').doc(String(referralId)).get()
  return snap.exists ? snap.data() : null
}

async function findDuplicateCredits() {
  const [earnerTransactions, advertiserTransactions] = await Promise.all([
    readTransactions('earnerTransactions'),
    readTransactions('advertiserTransactions'),
  ])
  const allTransactions = [
    ...earnerTransactions.map((tx) => ({ ...tx, collection: 'earnerTransactions', userCollection: 'earners' })),
    ...advertiserTransactions.map((tx) => ({ ...tx, collection: 'advertiserTransactions', userCollection: 'advertisers' })),
  ]

  const multiLevel = allTransactions.filter((tx) =>
    tx.data.type === 'multi_level_referral_bonus' &&
    number(tx.data.referralLevel) === 1 &&
    tx.data.activatedUserId &&
    number(tx.data.amount) > 0
  )
  const normalCredits = allTransactions.filter((tx) =>
    tx.data.type === 'referral_bonus' &&
    number(tx.data.amount) > 0
  )
  const candidates = []

  for (const multi of multiLevel) {
    const matching = []
    for (const normal of normalCredits) {
      if (normal.data.userId !== multi.data.userId) continue
      const referredId = normal.data.referredId || normal.data.referredUserId
      if (referredId && referredId !== multi.data.activatedUserId) continue

      const referral = await readReferral(normal.data.referralId)
      if (referral && referral.referredId !== multi.data.activatedUserId) continue
      if (!referral && referredId !== multi.data.activatedUserId) continue
      if (referral && referral.referrerId && referral.referrerId !== multi.data.userId) continue
      matching.push({ ...normal, referral })
    }

    matching.sort((a, b) => timestampValue(a.data.createdAt) - timestampValue(b.data.createdAt))
    if (matching.length === 0) continue

    // The legacy direct payout is the duplicate; keep the intended multi-level row.
    const duplicate = matching[0]
    candidates.push({
      userId: multi.data.userId,
      userCollection: multi.userCollection,
      activatedUserId: multi.data.activatedUserId,
      duplicate,
      kept: multi,
      amount: number(duplicate.data.amount),
    })
  }

  return candidates
}

async function findUserByEmail(email) {
  for (const collection of ['earners', 'advertisers']) {
    const snap = await db.collection(collection).where('email', '==', email).limit(1).get()
    if (!snap.empty) return { collection, ref: snap.docs[0].ref, data: snap.docs[0].data() }
  }
  return null
}

async function applyCandidate(candidate, recoveryByUserId) {
  const userRef = db.collection(candidate.userCollection).doc(candidate.userId)
  const correctionRef = db.collection('_referralCreditCorrections').doc(candidate.duplicate.id)

  await db.runTransaction(async (transaction) => {
    const [userSnap, duplicateSnap, correctionSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(candidate.duplicate.ref),
      transaction.get(correctionRef),
    ])
    if (correctionSnap.exists || !duplicateSnap.exists || !userSnap.exists) return

    const userData = userSnap.data() || {}
    const currentBalance = Math.max(0, number(userData.balance))
    const duplicateAmount = candidate.amount
    const deductedNow = Math.min(currentBalance, duplicateAmount)
    const addedDebt = duplicateAmount - deductedNow
    const configuredDebt = number(recoveryByUserId[candidate.userId] || 0)
    const existingDebt = Math.max(0, number(userData.pendingBalanceRecovery))
    const pendingRecovery = configuredDebt > 0
      ? configuredDebt
      : Math.max(existingDebt + addedDebt, configuredDebt)

    transaction.update(userRef, {
      balance: currentBalance - deductedNow,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      pendingBalanceRecovery: pendingRecovery,
      pendingBalanceRecoveryUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    transaction.delete(candidate.duplicate.ref)
    transaction.set(correctionRef, {
      type: 'duplicate_referral_credit_removed',
      userId: candidate.userId,
      activatedUserId: candidate.activatedUserId,
      deletedTransactionId: candidate.duplicate.id,
      keptTransactionId: candidate.kept.id,
      removedAmount: duplicateAmount,
      deductedFromBalance: deductedNow,
      addedRecoveryDebt: addedDebt,
      pendingRecoveryAfterCorrection: pendingRecovery,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  })
}

async function main() {
  const candidates = await findDuplicateCredits()
  const target = await findUserByEmail(RECOVERY_EMAIL)
  const recoveryByUserId = {}
  if (target) recoveryByUserId[target.ref.id] = RECOVERY_AMOUNT

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: found ${candidates.length} duplicate direct referral credits`)
  for (const candidate of candidates) {
    console.log(JSON.stringify({
      userId: candidate.userId,
      activatedUserId: candidate.activatedUserId,
      deletedTransactionId: candidate.duplicate.id,
      deletedAmount: candidate.amount,
      keptTransactionId: candidate.kept.id,
      collection: candidate.duplicate.collection,
    }))
  }
  if (target) {
    console.log(JSON.stringify({
      recoveryUserId: target.ref.id,
      recoveryEmail: RECOVERY_EMAIL,
      recoveryAmount: RECOVERY_AMOUNT,
      currentBalance: number(target.data.balance),
      existingPendingRecovery: number(target.data.pendingBalanceRecovery),
    }))
  } else {
    console.warn(`Recovery user not found: ${RECOVERY_EMAIL}`)
  }

  if (!APPLY) {
    console.log('No data changed. Re-run with --apply only after reviewing the listed transaction IDs.')
    return
  }

  let applied = 0
  for (const candidate of candidates) {
    await applyCandidate(candidate, recoveryByUserId)
    applied++
  }

  if (target) {
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(target.ref)
      if (!snap.exists) return
      const data = snap.data() || {}
      transaction.update(target.ref, {
        balance: 0,
        pendingBalanceRecovery: Math.max(RECOVERY_AMOUNT, number(data.pendingBalanceRecovery)),
        pendingBalanceRecoveryUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    })
  }
  console.log(`Applied ${applied} duplicate credit corrections.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})