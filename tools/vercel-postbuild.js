const TARGET_REFERRER_ID = 'onkluWVRJ3WN0FP7wnJAudRmRTg1'
const ACTIVATION_FEE = 2000

async function initFirebaseAdmin() {
  try {
    const adminModule = await import('firebase-admin')
    const admin = adminModule && (adminModule.default || adminModule)
    const fs = await import('fs')
    const path = await import('path')

    let dbAdmin = null
    const root = process.cwd()
    const candidates = ['serviceAccountKey.json', 'serviceAccountKey.json.json', 'serviceAccountKey.json.txt']
    const found = candidates.map((c) => path.join(root, c)).find((p) => fs.existsSync(p))

    if (found) {
      const raw = fs.readFileSync(found, 'utf8')
      const serviceAccount = JSON.parse(raw)
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        })
      }
      dbAdmin = admin.firestore()
      return { admin, dbAdmin }
    }

    const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT
    if (serviceAccountEnv) {
      const serviceAccount = JSON.parse(serviceAccountEnv)
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        })
      }
      dbAdmin = admin.firestore()
      return { admin, dbAdmin }
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      if (!admin.apps.length) admin.initializeApp()
      dbAdmin = admin.firestore()
      return { admin, dbAdmin }
    }

    return { admin: null, dbAdmin: null }
  } catch (error) {
    console.warn('[postbuild] firebase-admin initialization failed', error)
    return { admin: null, dbAdmin: null }
  }
}

function normalizeAmount(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

function parseDate(value) {
  if (!value) return null
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate()
  }
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function normalizeReferences(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

function getActivationAttemptDocId(role, userId) {
  return `${role}_${userId}`
}

function getUserDisplayName(data) {
  return String(data.fullName || data.businessName || data.name || data.companyName || 'Unnamed user')
}

function extractMonnifyReferenceCandidates(reference, source, transactionReference) {
  const nestedData =
    source && typeof source.data === 'object' && source.data !== null
      ? source.data
      : null

  const values = [
    reference,
    transactionReference || null,
    source?.transactionReference,
    source?.reference,
    source?.paymentReference,
    nestedData?.transactionReference,
    nestedData?.reference,
    nestedData?.paymentReference,
  ]

  return normalizeReferences(values)
}

function isSuccessfulMonnifyTransaction(transaction) {
  const status = String(transaction.paymentStatus || transaction.status || '').toUpperCase()
  return status === 'PAID' || status === 'SUCCESS' || status === 'SUCCESSFUL'
}

function getMonnifyTransactionEmail(transaction) {
  const customer = transaction.customer
  if (!customer || typeof customer !== 'object') return ''
  return String(customer.email || '').trim().toLowerCase()
}

function getMonnifyTransactionAmount(transaction) {
  return normalizeAmount(
    transaction.amountPaid ??
    transaction.amount ??
    transaction.totalPayable ??
    transaction.payableAmount
  )
}

function getMonnifyTransactionDate(transaction) {
  return (
    parseDate(transaction.paidOn) ||
    parseDate(transaction.completedOn) ||
    parseDate(transaction.createdOn)
  )
}

async function createMonnifyClient() {
  const base = process.env.MONNIFY_BASE_URL
  const apiKey = process.env.MONNIFY_API_KEY
  const secret = process.env.MONNIFY_SECRET_KEY
  const contractCode = process.env.MONNIFY_CONTRACT_CODE || process.env.NEXT_PUBLIC_MONNIFY_CONTRACT_CODE

  if (!base || !apiKey || !secret) {
    throw new Error('Monnify environment variables are missing')
  }

  const auth = Buffer.from(`${apiKey}:${secret}`).toString('base64')
  const authRes = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  })
  const authJson = await authRes.json().catch(() => ({}))
  if (!authRes.ok || !authJson?.responseBody?.accessToken) {
    throw new Error(`Monnify auth failed: ${JSON.stringify(authJson)}`)
  }

  const token = authJson.responseBody.accessToken

  async function get(path) {
    const res = await fetch(`${base}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    const json = await res.json().catch(() => ({}))
    return { res, json }
  }

  async function verifyReference(reference) {
    const candidates = [
      `/api/v1/transactions/query?transactionReference=${encodeURIComponent(reference)}`,
    ]

    if (contractCode) {
      candidates.push(`/api/v1/sdk/transactions/query/${contractCode}?transactionReference=${encodeURIComponent(reference)}&shouldIncludePaymentSessionInfo=true`)
      candidates.push(`/api/v1/sdk/transactions/query/${contractCode}?transactionReference=${encodeURIComponent(reference)}&shouldIncludePaymentSessionInfo=false`)
    }

    for (const path of candidates) {
      const attempt = await get(path)
      if (!attempt.res.ok || !attempt.json?.requestSuccessful) continue
      const responseBody = attempt.json.responseBody
      if (!responseBody || typeof responseBody !== 'object') continue
      const references = extractMonnifyReferenceCandidates(reference, responseBody, responseBody.transactionReference)
      if (references.length > 0 && isSuccessfulMonnifyTransaction(responseBody)) {
        return { transaction: responseBody, references }
      }
    }

    return null
  }

  async function searchByContext({ references = [], email, amount, notBefore }) {
    const normalizedReferences = normalizeReferences(references)
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const normalizedAmount = normalizeAmount(amount)
    const notBeforeDate = parseDate(notBefore)

    for (let page = 0; page < 8; page++) {
      const attempt = await get(`/api/v1/transactions/search?page=${page}&size=100`)
      if (!attempt.res.ok || !attempt.json?.requestSuccessful) break

      const body = attempt.json.responseBody || {}
      const transactions = Array.isArray(body.content)
        ? body.content
        : Array.isArray(body.transactions)
          ? body.transactions
          : []

      for (const transaction of transactions) {
        if (!isSuccessfulMonnifyTransaction(transaction)) continue

        const candidates = extractMonnifyReferenceCandidates('', transaction, transaction.transactionReference)
        if (normalizedReferences.length > 0 && candidates.some((candidate) => normalizedReferences.includes(candidate))) {
          return { transaction, references: candidates }
        }

        if (!normalizedEmail || normalizedAmount == null) continue

        const txEmail = getMonnifyTransactionEmail(transaction)
        const txAmount = getMonnifyTransactionAmount(transaction)
        if (txEmail !== normalizedEmail || txAmount !== normalizedAmount) continue

        const txDate = getMonnifyTransactionDate(transaction)
        if (notBeforeDate && txDate && txDate.getTime() + 5 * 60 * 1000 < notBeforeDate.getTime()) {
          continue
        }

        return { transaction, references: candidates }
      }

      if (transactions.length < 100) break
    }

    return null
  }

  return {
    verifyReference,
    searchByContext,
  }
}

async function isActivatedUser(dbAdmin, referredId) {
  const [earnerSnap, advertiserSnap] = await Promise.all([
    dbAdmin.collection('earners').doc(referredId).get(),
    dbAdmin.collection('advertisers').doc(referredId).get(),
  ])

  if (earnerSnap.exists) return Boolean(earnerSnap.data()?.activated)
  if (advertiserSnap.exists) return Boolean(advertiserSnap.data()?.activated)
  return false
}

async function processPendingActivationReferrals(dbAdmin, admin, userId) {
  const refsSnap = await dbAdmin.collection('referrals')
    .where('referredId', '==', userId)
    .where('status', '==', 'pending')
    .get()

  for (const referralDoc of refsSnap.docs) {
    const referral = referralDoc.data()
    const bonus = Number(referral.amount || 0)
    const referrerId = String(referral.referrerId || '')
    if (!referrerId || bonus <= 0) continue

    await dbAdmin.runTransaction(async (transaction) => {
      const referralRef = dbAdmin.collection('referrals').doc(referralDoc.id)
      const freshReferral = await transaction.get(referralRef)
      if (!freshReferral.exists || freshReferral.data()?.status !== 'pending') return

      const advertiserRef = dbAdmin.collection('advertisers').doc(referrerId)
      const earnerRef = dbAdmin.collection('earners').doc(referrerId)
      const [advertiserSnap, earnerSnap] = await Promise.all([
        transaction.get(advertiserRef),
        transaction.get(earnerRef),
      ])

      transaction.update(referralRef, {
        status: 'completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        bonusPaid: true,
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        paidAmount: bonus,
      })

      if (advertiserSnap.exists) {
        transaction.set(dbAdmin.collection('advertiserTransactions').doc(), {
          userId: referrerId,
          type: 'referral_bonus',
          amount: bonus,
          status: 'completed',
          note: `Referral bonus for referring ${userId}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        transaction.update(advertiserRef, {
          balance: admin.firestore.FieldValue.increment(bonus),
        })
      } else if (earnerSnap.exists) {
        transaction.set(dbAdmin.collection('earnerTransactions').doc(), {
          userId: referrerId,
          type: 'referral_bonus',
          amount: bonus,
          status: 'completed',
          note: `Referral bonus for referring ${userId}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        transaction.update(earnerRef, {
          balance: admin.firestore.FieldValue.increment(bonus),
        })
      }
    })
  }
}

async function upsertActivationAttempt(dbAdmin, admin, candidate, updates = {}) {
  await dbAdmin.collection('activationAttempts').doc(getActivationAttemptDocId(candidate.role, candidate.userId)).set({
    userId: candidate.userId,
    role: candidate.role,
    provider: candidate.provider || 'monnify',
    email: candidate.email,
    name: candidate.name,
    reference: candidate.references[0] || '',
    references: candidate.references,
    attemptedAt: candidate.activationAttemptedAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    status: 'pending',
    ...updates,
  }, { merge: true })
}

async function repairActivation(dbAdmin, admin, candidate, verifiedReferences) {
  const collectionName = candidate.role === 'earner' ? 'earners' : 'advertisers'
  const txCollection = candidate.role === 'earner' ? 'earnerTransactions' : 'advertiserTransactions'
  const allReferences = normalizeReferences([...(candidate.references || []), ...(verifiedReferences || [])])
  const primaryReference = allReferences[0] || 'manual_admin_recovery'
  const userRef = dbAdmin.collection(collectionName).doc(candidate.userId)

  await userRef.update({
    activated: true,
    activatedAt: admin.firestore.FieldValue.serverTimestamp(),
    activationPaymentProvider: candidate.provider || 'monnify',
    activationReference: primaryReference,
    activationReferences: allReferences,
    pendingActivationReference: admin.firestore.FieldValue.delete(),
    pendingActivationReferences: admin.firestore.FieldValue.delete(),
    pendingActivationProvider: admin.firestore.FieldValue.delete(),
    activationAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(candidate.role === 'earner'
      ? {
          nextActivationDue: admin.firestore.Timestamp.fromMillis(Date.now() + 1000 * 60 * 60 * 24 * 30 * 3),
        }
      : {}),
  })

  const existingTx = await dbAdmin.collection(txCollection)
    .where('userId', '==', candidate.userId)
    .where('type', '==', 'activation_fee')
    .where('status', '==', 'completed')
    .limit(1)
    .get()

  if (existingTx.empty) {
    await dbAdmin.collection(txCollection).doc().set({
      userId: candidate.userId,
      type: 'activation_fee',
      amount: -ACTIVATION_FEE,
      provider: candidate.provider || 'monnify',
      reference: primaryReference,
      status: 'completed',
      note: 'Activation fee payment',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  }

  await upsertActivationAttempt(dbAdmin, admin, {
    ...candidate,
    references: allReferences,
  }, {
    status: 'completed',
    completedReference: primaryReference,
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    pendingReference: admin.firestore.FieldValue.delete(),
  })

  await processPendingActivationReferrals(dbAdmin, admin, candidate.userId)
}

async function recoverPendingWalletFundings(dbAdmin, admin, monnify) {
  if (!monnify) {
    console.log('[postbuild] skipping wallet funding recovery because Monnify client is unavailable')
    return
  }

  const pendingWalletSnap = await dbAdmin.collection('advertiserTransactions')
    .where('type', '==', 'wallet_funding')
    .where('status', '==', 'pending')
    .get()

  console.log(`[postbuild] found ${pendingWalletSnap.size} pending advertiser wallet funding records`)

  let repaired = 0
  let unresolved = 0

  for (const txDoc of pendingWalletSnap.docs) {
    const tx = txDoc.data() || {}
    const userId = String(tx.userId || '')
    const amount = Number(tx.amount || 0)
    if (!userId || amount <= 0) {
      unresolved += 1
      continue
    }

    const advertiserSnap = await dbAdmin.collection('advertisers').doc(userId).get()
    const advertiser = advertiserSnap.exists ? advertiserSnap.data() || {} : {}
    const references = normalizeReferences([
      tx.reference,
      ...(Array.isArray(tx.referenceCandidates) ? tx.referenceCandidates : []),
    ])

    let verified = null
    for (const reference of references) {
      verified = await monnify.verifyReference(reference)
      if (verified) break
    }

    if (!verified) {
      verified = await monnify.searchByContext({
        references,
        email: String(advertiser.email || '').trim().toLowerCase(),
        amount,
        notBefore: parseDate(tx.createdAt),
      })
    }

    if (!verified) {
      unresolved += 1
      console.log('[postbuild] wallet funding still requires manual check', {
        transactionId: txDoc.id,
        userId,
        amount,
        references,
      })
      continue
    }

    const verifiedReferences = normalizeReferences([...(verified.references || []), ...references])
    const primaryReference = verifiedReferences[0] || String(tx.reference || '')
    const completedExists = await dbAdmin.collection('advertiserTransactions')
      .where('userId', '==', userId)
      .where('reference', '==', primaryReference)
      .where('type', '==', 'wallet_funding')
      .where('status', '==', 'completed')
      .limit(1)
      .get()

    if (completedExists.empty) {
      await txDoc.ref.update({
        amount,
        provider: String(tx.provider || 'monnify'),
        reference: primaryReference,
        referenceCandidates: verifiedReferences,
        status: 'completed',
        note: `Wallet funded via ${String(tx.provider || 'monnify')}`,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      await dbAdmin.collection('advertisers').doc(userId).update({
        balance: admin.firestore.FieldValue.increment(amount),
      })
    } else {
      await txDoc.ref.update({
        reference: primaryReference,
        referenceCandidates: verifiedReferences,
        status: 'completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }

    repaired += 1
    console.log('[postbuild] repaired pending wallet funding', {
      transactionId: txDoc.id,
      userId,
      amount,
      references: verifiedReferences,
    })
  }

  console.log(`[postbuild] wallet funding recovery complete; repaired=${repaired}, unresolved=${unresolved}`)
}

async function backfillReferralBonuses() {
  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!admin || !dbAdmin) {
    console.log('[postbuild] skipping referral backfill because firebase admin is unavailable')
    return
  }

  const referralsSnap = await dbAdmin
    .collection('referrals')
    .where('referrerId', '==', TARGET_REFERRER_ID)
    .get()

  console.log(`[postbuild] found ${referralsSnap.size} referrals for ${TARGET_REFERRER_ID}`)

  for (const referralDoc of referralsSnap.docs) {
    const referral = referralDoc.data()
    const referredId = String(referral.referredId || '')
    const bonus = Number(referral.amount || 0)

    if (!referredId || bonus <= 0) continue

    const activated = await isActivatedUser(dbAdmin, referredId)
    if (!activated) {
      console.log(`[postbuild] skipping referral ${referralDoc.id}; referred user not activated`)
      continue
    }

    await dbAdmin.runTransaction(async (transaction) => {
      const referralRef = dbAdmin.collection('referrals').doc(referralDoc.id)
      const referralSnap = await transaction.get(referralRef)
      if (!referralSnap.exists) return

      const currentReferral = referralSnap.data() || {}
      if (currentReferral.bonusPaid === true) return

      const [earnerSnap, advertiserSnap] = await Promise.all([
        transaction.get(dbAdmin.collection('earners').doc(TARGET_REFERRER_ID)),
        transaction.get(dbAdmin.collection('advertisers').doc(TARGET_REFERRER_ID)),
      ])

      if (!earnerSnap.exists && !advertiserSnap.exists) {
        console.warn(`[postbuild] referrer account ${TARGET_REFERRER_ID} not found; leaving referral ${referralDoc.id} untouched`)
        return
      }

      transaction.update(referralRef, {
        status: 'completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        bonusPaid: true,
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        paidAmount: bonus,
      })

      if (earnerSnap.exists) {
        transaction.set(dbAdmin.collection('earnerTransactions').doc(), {
          userId: TARGET_REFERRER_ID,
          type: 'referral_bonus',
          amount: bonus,
          status: 'completed',
          note: `Referral bonus for referring ${referredId}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        transaction.update(dbAdmin.collection('earners').doc(TARGET_REFERRER_ID), {
          balance: admin.firestore.FieldValue.increment(bonus),
        })
        return
      }

      if (advertiserSnap.exists) {
        transaction.set(dbAdmin.collection('advertiserTransactions').doc(), {
          userId: TARGET_REFERRER_ID,
          type: 'referral_bonus',
          amount: bonus,
          status: 'completed',
          note: `Referral bonus for referring ${referredId}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        transaction.update(dbAdmin.collection('advertisers').doc(TARGET_REFERRER_ID), {
          balance: admin.firestore.FieldValue.increment(bonus),
        })
      }
    })

    console.log(`[postbuild] backfilled referral ${referralDoc.id} for referred user ${referredId}`)
  }
}

async function recoverStuckActivations() {
  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!admin || !dbAdmin) {
    console.log('[postbuild] skipping activation recovery because firebase admin is unavailable')
    return
  }

  let monnify = null
  try {
    monnify = await createMonnifyClient()
  } catch (error) {
    console.warn('[postbuild] activation recovery could not initialize Monnify client', error)
  }

  const [earnersSnap, advertisersSnap, attemptsSnap] = await Promise.all([
    dbAdmin.collection('earners').get(),
    dbAdmin.collection('advertisers').get(),
    dbAdmin.collection('activationAttempts').get(),
  ])

  const attemptsByKey = new Map()
  for (const doc of attemptsSnap.docs) {
    const data = doc.data() || {}
    const role = String(data.role || '') === 'advertiser' ? 'advertiser' : String(data.role || '') === 'earner' ? 'earner' : null
    const userId = String(data.userId || '')
    if (!role || !userId) continue
    attemptsByKey.set(`${role}:${userId}`, data)
  }

  const candidates = [...earnersSnap.docs.map((doc) => ({ doc, role: 'earner' })), ...advertisersSnap.docs.map((doc) => ({ doc, role: 'advertiser' }))]
    .map(({ doc, role }) => {
      const data = doc.data() || {}
      if (data.activated) return null

      const attempt = attemptsByKey.get(`${role}:${doc.id}`) || {}
      const references = normalizeReferences([
        data.pendingActivationReference,
        ...(Array.isArray(data.pendingActivationReferences) ? data.pendingActivationReferences : []),
        data.activationReference,
        ...(Array.isArray(data.activationReferences) ? data.activationReferences : []),
        attempt.reference,
        ...(Array.isArray(attempt.references) ? attempt.references : []),
      ])

      if (references.length === 0) return null

      return {
        userId: doc.id,
        role,
        provider: String(data.pendingActivationProvider || data.activationPaymentProvider || attempt.provider || 'monnify'),
        email: String(data.email || attempt.email || '').trim().toLowerCase(),
        name: getUserDisplayName({ ...attempt, ...data }),
        references,
        activationAttemptedAt: parseDate(data.activationAttemptedAt) || parseDate(attempt.attemptedAt) || parseDate(attempt.updatedAt),
      }
    })
    .filter(Boolean)

  console.log(`[postbuild] found ${candidates.length} activation candidates to inspect`)

  let repaired = 0
  let surfacedOnly = 0

  for (const candidate of candidates) {
    await upsertActivationAttempt(dbAdmin, admin, candidate)

    if (!monnify) {
      surfacedOnly += 1
      continue
    }

    let verified = null

    for (const reference of candidate.references) {
      verified = await monnify.verifyReference(reference)
      if (verified) break
    }

    if (!verified) {
      verified = await monnify.searchByContext({
        references: candidate.references,
        email: candidate.email,
        amount: ACTIVATION_FEE,
        notBefore: candidate.activationAttemptedAt,
      })
    }

    if (!verified) {
      surfacedOnly += 1
      console.log('[postbuild] activation candidate still requires manual check', {
        userId: candidate.userId,
        role: candidate.role,
        email: candidate.email,
        references: candidate.references,
      })
      continue
    }

    const verifiedReferences = normalizeReferences([
      ...(verified.references || []),
      ...candidate.references,
    ])
    await repairActivation(dbAdmin, admin, candidate, verifiedReferences)
    repaired += 1
    console.log('[postbuild] repaired stuck activation', {
      userId: candidate.userId,
      role: candidate.role,
      references: verifiedReferences,
    })
  }

  console.log(`[postbuild] activation recovery complete; repaired=${repaired}, surfacedOnly=${surfacedOnly}`)

  await recoverPendingWalletFundings(dbAdmin, admin, monnify)
}

async function main() {
  if (!process.env.VERCEL && !process.env.VERCEL_ENV) {
    console.log('[postbuild] skipping vercel-only postbuild tasks outside Vercel')
    return
  }

  await backfillReferralBonuses()
  await recoverStuckActivations()
}

main().catch((error) => {
  console.error('[postbuild] failed', error)
})
