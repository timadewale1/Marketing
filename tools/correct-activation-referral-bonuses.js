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
const sinceArg = process.argv.find((arg) => arg.startsWith('--since='))
const SINCE = sinceArg ? new Date(sinceArg.slice('--since='.length)) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
const STANDARD_BONUS = 500

if (!Number.isFinite(SINCE.getTime())) {
  throw new Error('Invalid --since date. Use --since=YYYY-MM-DD.')
}

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

function transactionCollection(userCollection) {
  return userCollection === 'advertisers' ? 'advertiserTransactions' : 'earnerTransactions'
}

async function getRecentlyActivatedUsers() {
  const sinceTimestamp = admin.firestore.Timestamp.fromDate(SINCE)
  const collections = ['earners', 'advertisers']
  const snapshots = await Promise.all(collections.map((name) =>
    db.collection(name).where('activatedAt', '>=', sinceTimestamp).get()
  ))
  return snapshots.flatMap((snapshot, index) => snapshot.docs
    .filter((doc) => doc.data().activated === true)
    .map((doc) => ({
      id: doc.id,
      collection: collections[index],
      activatedAt: doc.data().activatedAt,
    })))
}

async function findMatchingBonusTransactions(referral, activatedUserId, transactionCache) {
  const referrer = await findReferrer(referral.referrerId)
  if (!referrer || !['earners', 'advertisers'].includes(referrer.collection)) {
    return { referrer, matches: [] }
  }

  const cacheKey = `${referrer.collection}:${referral.referrerId}`
  if (!transactionCache.has(cacheKey)) {
    const snapshot = await db.collection(transactionCollection(referrer.collection))
      .where('userId', '==', referral.referrerId)
      .get()
    transactionCache.set(cacheKey, snapshot.docs.map((doc) => ({
      id: doc.id,
      ref: doc.ref,
      data: doc.data(),
    })))
  }

  const referralId = referral.id
  const matches = transactionCache.get(cacheKey).filter((transaction) => {
    const data = transaction.data
    if (data.type !== 'referral_bonus' || data.status !== 'completed') return false
    if (data.referralId === referralId) return true
    if ((data.referredUserId || data.referredId) === activatedUserId) return true
    return transaction.id.startsWith(`${referralId}-`)
  })

  return { referrer, matches }
}

async function findReferrer(referrerId) {
  if (!referrerId) return null
  for (const collection of ['earners', 'advertisers']) {
    const ref = db.collection(collection).doc(referrerId)
    const snap = await ref.get()
    if (snap.exists) return { collection, ref, data: snap.data() || {} }
  }
  return null
}

async function inspectRecentActivations() {
  const users = await getRecentlyActivatedUsers()
  const transactionCache = new Map()
  const activations = []

  for (const user of users) {
    const referralSnapshot = await db.collection('referrals')
      .where('referredId', '==', user.id)
      .get()
    const referrals = referralSnapshot.docs.filter((doc) =>
      String(doc.data().condition || 'activation').toLowerCase() === 'activation'
    )

    if (referrals.length === 0) {
      activations.push({ activatedUserId: user.id, role: user.collection, activatedAt: timestampValue(user.activatedAt), referral: null })
      continue
    }

    for (const referralDoc of referrals) {
      const referral = { id: referralDoc.id, ...referralDoc.data() }
      const { referrer, matches } = await findMatchingBonusTransactions(referral, user.id, transactionCache)
      activations.push({
        activatedUserId: user.id,
        role: user.collection,
        activatedAt: timestampValue(user.activatedAt),
        referralId: referralDoc.id,
        referrerId: referral.referrerId || null,
        referralStatus: referral.status || null,
        bonusPaid: referral.bonusPaid === true,
        referralAmount: number(referral.amount),
        paidAmount: number(referral.paidAmount),
        referrerCollection: referrer?.collection || null,
        referrerBalance: referrer ? number(referrer.data.balance) : null,
        transactions: matches.map((match) => ({
          id: match.id,
          collection: transactionCollection(referrer.collection),
          amount: number(match.data.amount),
          netAmount: number(match.data.netAmount ?? match.data.amount),
          recoveryOffsetApplied: number(match.data.recoveryOffsetApplied),
          createdAt: timestampValue(match.data.createdAt),
        })),
      })
    }
  }

  return { users, activations }
}

async function inspectPendingReferrals() {
  const snapshot = await db.collection('referrals').where('status', '==', 'pending').get()
  return snapshot.docs
    .filter((doc) => {
      const data = doc.data()
      return String(data.condition || 'activation').toLowerCase() === 'activation'
        && data.bonusPaid !== true
        && number(data.amount) === 2000
    })
    .map((doc) => ({ id: doc.id, ref: doc.ref, data: doc.data() }))
}

async function inspectPendingMultiLevelBonuses() {
  const referralSnapshot = await db.collection('referrals').where('status', '==', 'pending').get()
  const pendingReferralRecords = referralSnapshot.docs
    .filter((doc) => {
      const data = doc.data()
      return doc.id.startsWith('multi-level-')
        || data.type === 'multi_level_referral_bonus'
        || (
          number(data.level) > 0
          && Boolean(data.activatedUserId)
          && Boolean(data.referrerId)
          && data.creditsApplied !== true
        )
    })
    .map((doc) => ({ id: doc.id, ref: doc.ref, collection: 'referrals' }))

  const transactionSnapshots = await Promise.all(
    ['earnerTransactions', 'advertiserTransactions'].map((collectionName) =>
      db.collection(collectionName).where('type', '==', 'multi_level_referral_bonus').get()
    )
  )
  const pendingTransactions = transactionSnapshots.flatMap((snapshot, index) =>
    snapshot.docs
      .filter((doc) => String(doc.data().status || '').toLowerCase() === 'pending')
      .map((doc) => ({
        id: doc.id,
        ref: doc.ref,
        collection: ['earnerTransactions', 'advertiserTransactions'][index],
      }))
  )

  return [...pendingReferralRecords, ...pendingTransactions]
}

async function cancelPendingMultiLevelBonus(record) {
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(record.ref)
    if (!snapshot.exists || String(snapshot.data()?.status || '').toLowerCase() !== 'pending') {
      return 'no_longer_pending'
    }
    transaction.update(record.ref, {
      status: 'cancelled',
      multiLevelBonusSuppressed: true,
      suppressionReason: 'Standard activation uses direct referral bonus only',
      suppressedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    return 'cancelled'
  })
}

async function applyPaidCorrection(activation) {
  const referralRef = db.collection('referrals').doc(activation.referralId)
  const transactionRef = db.collection(activation.transactions[0].collection).doc(activation.transactions[0].id)
  const referrerRef = db.collection(activation.referrerCollection).doc(activation.referrerId)
  const correctionRef = db.collection('_referralCreditCorrections').doc(`activation-500-${activation.transactions[0].id}`)
  const adjustmentRef = db.collection(activation.transactions[0].collection).doc(`referral-adjustment-${activation.transactions[0].id}`)

  return db.runTransaction(async (transaction) => {
    const [referralSnap, bonusSnap, referrerSnap, correctionSnap, adjustmentSnap] = await Promise.all([
      transaction.get(referralRef),
      transaction.get(transactionRef),
      transaction.get(referrerRef),
      transaction.get(correctionRef),
      transaction.get(adjustmentRef),
    ])

    if (correctionSnap.exists) return { status: 'already_corrected' }
    if (!referralSnap.exists || !bonusSnap.exists || !referrerSnap.exists) return { status: 'missing_record' }
    if (adjustmentSnap.exists) return { status: 'adjustment_record_exists' }

    const referral = referralSnap.data() || {}
    const bonus = bonusSnap.data() || {}
    const referrer = referrerSnap.data() || {}
    if (referral.referrerId !== activation.referrerId
      || referral.referredId !== activation.activatedUserId
      || String(referral.condition || 'activation').toLowerCase() !== 'activation'
      || referral.bonusPaid !== true
      || bonus.type !== 'referral_bonus'
      || bonus.status !== 'completed'
      || bonus.userId !== activation.referrerId
      || (bonus.referralId !== activation.referralId
        && (bonus.referredUserId || bonus.referredId) !== activation.activatedUserId
        && !transactionRef.id.startsWith(`${activation.referralId}-`))) {
      return { status: 'changed_or_mismatched' }
    }

    const originalAmount = number(bonus.amount)
    if (originalAmount !== 2000) return { status: 'no_longer_2000' }

    const originalNet = number(bonus.netAmount ?? bonus.amount)
    const recoveryOffset = number(bonus.recoveryOffsetApplied)
    const correctedNet = Math.max(0, STANDARD_BONUS - recoveryOffset)
    const debit = Math.max(0, originalNet - correctedNet)
    const balance = number(referrer.balance)
    if (debit <= 0) return { status: 'no_wallet_overcredit' }
    if (balance < debit) return { status: 'insufficient_balance', balance, debit }

    const timestamp = admin.firestore.FieldValue.serverTimestamp()
    transaction.update(referrerRef, {
      balance: admin.firestore.FieldValue.increment(-debit),
      updatedAt: timestamp,
    })
    transaction.update(transactionRef, {
      amount: STANDARD_BONUS,
      netAmount: correctedNet,
      correctedFromAmount: originalAmount,
      correctionAppliedAt: timestamp,
    })
    transaction.update(referralRef, {
      amount: STANDARD_BONUS,
      paidAmount: STANDARD_BONUS,
      bonusCorrectedAt: timestamp,
    })
    transaction.set(adjustmentRef, {
      userId: activation.referrerId,
      type: 'referral_bonus_adjustment',
      amount: -debit,
      status: 'completed',
      note: 'Correction of activation referral bonus from ₦2,000 to ₦500',
      referralId: activation.referralId,
      referredUserId: activation.activatedUserId,
      originalTransactionId: transactionRef.id,
      previousBonusAmount: originalAmount,
      correctedBonusAmount: STANDARD_BONUS,
      createdAt: timestamp,
    })
    transaction.set(correctionRef, {
      type: 'activation_referral_bonus_corrected',
      userId: activation.referrerId,
      activatedUserId: activation.activatedUserId,
      referralId: activation.referralId,
      originalTransactionId: transactionRef.id,
      adjustmentTransactionId: adjustmentRef.id,
      previousBonusAmount: originalAmount,
      correctedBonusAmount: STANDARD_BONUS,
      walletDebit: debit,
      balanceAfterCorrection: balance - debit,
      createdAt: timestamp,
    })
    return { status: 'corrected', debit, balanceAfter: balance - debit }
  })
}

async function correctPendingReferral(referral) {
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(referral.ref)
    if (!snapshot.exists) return 'missing_record'
    const data = snapshot.data() || {}
    if (data.bonusPaid === true
      || String(data.status || 'pending').toLowerCase() !== 'pending'
      || String(data.condition || 'activation').toLowerCase() !== 'activation'
      || number(data.amount) !== 2000) {
      return 'changed_or_mismatched'
    }
    transaction.update(referral.ref, {
      amount: STANDARD_BONUS,
      amountCorrectedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    return 'corrected'
  })
}

async function main() {
  const { users, activations } = await inspectRecentActivations()
  const pendingReferrals = await inspectPendingReferrals()
  const pendingMultiLevelBonuses = await inspectPendingMultiLevelBonuses()
  const overpaid = activations.filter((activation) =>
    activation.transactions?.some((transaction) => transaction.amount === 2000)
  )

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} since ${SINCE.toISOString()}`)
  console.log(`Recent activated accounts: ${users.length}`)
  console.log(`Activation/referral audit rows: ${activations.length}`)
  console.log(`Confirmed ₦2,000 referral payouts: ${overpaid.length}`)
  console.log(JSON.stringify(activations, null, 2))
  console.log(`Pending activation referrals with ₦2,000 amount: ${pendingReferrals.length}`)
  console.log(JSON.stringify(pendingReferrals.map(({ id, data }) => ({
    referralId: id,
    referrerId: data.referrerId || null,
    referredId: data.referredId || null,
    currentAmount: number(data.amount),
  })), null, 2))
  console.log(`Pending multi-level bonus records: ${pendingMultiLevelBonuses.length}`)
  console.log(JSON.stringify(pendingMultiLevelBonuses.map(({ id, collection }) => ({ id, collection })), null, 2))

  if (!APPLY) {
    console.log('Read-only audit completed. No Firestore data changed.')
    return
  }

  let corrected = 0
  let skipped = 0
  for (const activation of overpaid) {
    if (activation.transactions.length !== 1 || !activation.referrerCollection) {
      console.warn(JSON.stringify({ referralId: activation.referralId, status: 'ambiguous_transaction_or_referrer' }))
      skipped++
      continue
    }
    const result = await applyPaidCorrection(activation)
    console.log(JSON.stringify({ referralId: activation.referralId, ...result }))
    if (result.status === 'corrected') corrected++
    else skipped++
  }

  let pendingCorrected = 0
  for (const referral of pendingReferrals) {
    const status = await correctPendingReferral(referral)
    console.log(JSON.stringify({ referralId: referral.id, pendingStatus: status }))
    if (status === 'corrected') pendingCorrected++
  }
  let multilevelCancelled = 0
  for (const record of pendingMultiLevelBonuses) {
    const status = await cancelPendingMultiLevelBonus(record)
    console.log(JSON.stringify({ recordId: record.id, collection: record.collection, multiLevelStatus: status }))
    if (status === 'cancelled') multilevelCancelled++
  }
  console.log(`Corrections complete: ${corrected} paid payouts corrected, ${pendingCorrected} pending referrals normalized, ${multilevelCancelled} pending multi-level records cancelled, ${skipped} paid payouts left unchanged.`)
}

main().catch((error) => {
  console.error('Activation referral audit/correction failed:', error)
  process.exitCode = 1
})
