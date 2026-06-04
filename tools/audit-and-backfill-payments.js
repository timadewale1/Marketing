const fs = require("fs")
const path = require("path")
const admin = require("firebase-admin")

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env")
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, "utf8")
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

function normalizeReferences(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
}

function asDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value.toDate === "function") return value.toDate()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isPaidStatus(value) {
  const status = String(value || "").toUpperCase()
  return status === "PAID" || status === "SUCCESS" || status === "SUCCESSFUL"
}

function extractRefs(source, extra = []) {
  if (!source || typeof source !== "object") return normalizeReferences(extra)
  const responseBody = source.responseBody && typeof source.responseBody === "object" ? source.responseBody : null
  const data = source.data && typeof source.data === "object" ? source.data : null
  return normalizeReferences([
    ...extra,
    source.reference,
    source.paymentReference,
    source.transactionReference,
    responseBody && responseBody.reference,
    responseBody && responseBody.paymentReference,
    responseBody && responseBody.transactionReference,
    data && data.reference,
    data && data.paymentReference,
    data && data.transactionReference,
  ])
}

function getItems(payload) {
  const body = payload && payload.responseBody
  if (!body || typeof body !== "object") return []
  if (Array.isArray(body.content)) return body.content
  if (Array.isArray(body.transactions)) return body.transactions
  if (Array.isArray(body.data)) return body.data
  return []
}

function chunkArray(values, size) {
  const chunks = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

async function getMonnifyToken() {
  const base = process.env.MONNIFY_BASE_URL
  const apiKey = process.env.MONNIFY_API_KEY
  const secret = process.env.MONNIFY_SECRET_KEY
  if (!base || !apiKey || !secret) return null

  const auth = Buffer.from(`${apiKey}:${secret}`).toString("base64")
  const res = await fetch(`${base.replace(/\/$/, "")}/api/v1/auth/login`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.responseBody?.accessToken) {
    throw new Error(`Monnify auth failed: ${JSON.stringify(json)}`)
  }
  return json.responseBody.accessToken
}

async function monnifyGet(token, apiPath) {
  const base = process.env.MONNIFY_BASE_URL
  const res = await fetch(`${base.replace(/\/$/, "")}${apiPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, json }
}

async function verifyMonnifyReference(token, reference, searchCache) {
  if (!token || !reference) return null
  const contractCode = process.env.MONNIFY_CONTRACT_CODE || process.env.NEXT_PUBLIC_MONNIFY_CONTRACT_CODE
  const attempts = []

  if (reference.toUpperCase().startsWith("MNFY|")) {
    attempts.push(`/api/v2/transactions/${encodeURIComponent(reference)}`)
  }
  attempts.push(`/api/v2/merchant/transactions/query?paymentReference=${encodeURIComponent(reference)}`)
  attempts.push(`/api/v2/merchant/transactions/query?transactionReference=${encodeURIComponent(reference)}`)
  if (contractCode) {
    attempts.push(`/api/v1/sdk/transactions/query/${encodeURIComponent(contractCode)}?transactionReference=${encodeURIComponent(reference)}&shouldIncludePaymentSessionInfo=true`)
  }
  attempts.push(`/api/v1/transactions/query?transactionReference=${encodeURIComponent(reference)}`)

  for (const apiPath of attempts) {
    const { ok, json } = await monnifyGet(token, apiPath)
    const body = json.responseBody || json.data || json
    if (ok && json.requestSuccessful !== false && isPaidStatus(body.paymentStatus || body.status)) {
      return { paid: true, refs: extractRefs(body, [reference]), rawStatus: body.paymentStatus || body.status }
    }
  }

  if (!searchCache.loaded) {
    searchCache.loaded = true
    searchCache.items = []
    for (const apiPath of ["/api/v1/transactions/search?page=0&size=100", "/api/v1/merchant/transactions?pageSize=100&pageNo=0"]) {
      const { ok, json } = await monnifyGet(token, apiPath)
      if (ok && json.requestSuccessful !== false) {
        searchCache.items.push(...getItems(json))
      }
    }
  }

  const found = searchCache.items.find((item) => extractRefs(item).includes(reference))
  if (found && isPaidStatus(found.paymentStatus || found.status)) {
    return { paid: true, refs: extractRefs(found, [reference]), rawStatus: found.paymentStatus || found.status }
  }

  return null
}

async function findReferrer(db, referrerId) {
  const advertiserRef = db.collection("advertisers").doc(referrerId)
  const earnerRef = db.collection("earners").doc(referrerId)
  const [advertiserSnap, earnerSnap] = await Promise.all([advertiserRef.get(), earnerRef.get()])
  if (advertiserSnap.exists) return { collection: "advertisers", ref: advertiserRef }
  if (earnerSnap.exists) return { collection: "earners", ref: earnerRef }
  return null
}

async function completePendingReferrals(db, FieldValue, userId, source, report) {
  const refsSnap = await db.collection("referrals")
    .where("referredId", "==", userId)
    .where("status", "==", "pending")
    .get()

  for (const referralDoc of refsSnap.docs) {
    const data = referralDoc.data()
    const bonus = Number(data.amount || 0)
    const referrerId = String(data.referrerId || "").trim()
    if (!referrerId || bonus <= 0) continue
    const referrer = await findReferrer(db, referrerId)
    if (!referrer) continue

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(referralDoc.ref)
      if (!snap.exists || snap.data().status !== "pending") return
      const txCollection = referrer.collection === "advertisers" ? "advertiserTransactions" : "earnerTransactions"
      tx.update(referralDoc.ref, {
        status: "completed",
        completedAt: FieldValue.serverTimestamp(),
        bonusPaid: true,
        paidAt: FieldValue.serverTimestamp(),
        paidAmount: bonus,
        backfilledAt: FieldValue.serverTimestamp(),
        backfillSource: source,
      })
      tx.update(referrer.ref, { balance: FieldValue.increment(bonus) })
      tx.set(db.collection(txCollection).doc(), {
        userId: referrerId,
        type: "referral_bonus",
        amount: bonus,
        status: "completed",
        note: `Referral bonus for referring ${userId}`,
        referralId: referralDoc.id,
        referredId: userId,
        source,
        createdAt: FieldValue.serverTimestamp(),
      })
    })

    report.referralsCompleted.push({
      referralId: referralDoc.id,
      referredId: userId,
      referrerId,
      amount: bonus,
      source,
    })
  }
}

async function completeActivation(db, FieldValue, role, userId, reference, refs, provider, source, report) {
  const collection = role === "advertiser" ? "advertisers" : "earners"
  const userRef = db.collection(collection).doc(userId)
  const userSnap = await userRef.get()
  if (!userSnap.exists) return false
  if (!userSnap.data().activated) {
    const update = {
      activated: true,
      activatedAt: FieldValue.serverTimestamp(),
      activationPaymentProvider: provider || "monnify",
      activationReference: reference,
      activationReferences: refs,
      pendingActivationReference: FieldValue.delete(),
      pendingActivationReferences: FieldValue.delete(),
      pendingActivationProvider: FieldValue.delete(),
      recoveryDisposition: FieldValue.delete(),
    }
    if (role === "earner") {
      update.nextActivationDue = admin.firestore.Timestamp.fromMillis(Date.now() + 1000 * 60 * 60 * 24 * 30 * 3)
    }
    await userRef.set(update, { merge: true })
    await db.collection(role === "earner" ? "earnerTransactions" : "advertiserTransactions").add({
      userId,
      type: "activation_fee",
      amount: -2000,
      activationFeeAmount: 2000,
      paidAmount: 2000,
      walletOffsetAmount: 0,
      provider: provider || "monnify",
      reference,
      referenceCandidates: refs,
      status: "completed",
      note: "Membership fee payment",
      source,
      createdAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
    })
  }

  await db.collection("activationAttempts").doc(`${role}_${userId}`).set({
    status: "completed",
    completedAt: FieldValue.serverTimestamp(),
    completedReference: reference,
    references: FieldValue.arrayUnion(...refs),
    recoveryDisposition: FieldValue.delete(),
    nextRecoveryCheckAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
    source,
  }, { merge: true })

  await completePendingReferrals(db, FieldValue, userId, source, report)
  report.activationsRecovered.push({ role, userId, reference, references: refs, source })
  return true
}

async function completeWalletFunding(db, FieldValue, txDoc, refs, source, report) {
  const data = txDoc.data()
  const userId = String(data.userId || "")
  const amount = Number(data.amount || 0)
  if (!userId || amount <= 0) return false

  await db.runTransaction(async (tx) => {
    const freshTx = await tx.get(txDoc.ref)
    if (!freshTx.exists || freshTx.data().status !== "pending") return
    const advertiserRef = db.collection("advertisers").doc(userId)
    const advertiserSnap = await tx.get(advertiserRef)
    if (!advertiserSnap.exists) return
    tx.update(txDoc.ref, {
      status: "completed",
      note: `Wallet funded via ${String(data.provider || "monnify")}`,
      reference: refs[0] || String(data.reference || ""),
      referenceCandidates: refs,
      completedAt: FieldValue.serverTimestamp(),
      recoveryDisposition: FieldValue.delete(),
      nextRecoveryCheckAt: FieldValue.delete(),
      lastRecoveryVerificationState: "paid",
      source,
    })
    tx.update(advertiserRef, { balance: FieldValue.increment(amount) })
  })

  report.walletRecovered.push({
    transactionId: txDoc.id,
    userId,
    amount,
    reference: refs[0] || String(data.reference || ""),
    references: refs,
    source,
  })
  return true
}

async function main() {
  loadEnv()
  const dryRun = process.argv.includes("--dry-run")
  const referralsOnly = process.argv.includes("--referrals-only")
  const paymentsOnly = process.argv.includes("--payments-only")
  const runPayments = !referralsOnly
  const runReferrals = !paymentsOnly
  const maxItemsArg = process.argv.find((arg) => arg.startsWith("--limit="))
  const maxItems = maxItemsArg ? Math.max(1, Number(maxItemsArg.split("=")[1]) || 50) : 50

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}")
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  }

  const db = admin.firestore()
  const FieldValue = admin.firestore.FieldValue
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const searchCache = { loaded: false, items: [] }
  const report = {
    generatedAt: new Date().toISOString(),
    cutoff: cutoff.toISOString(),
    activationsRecovered: [],
    walletRecovered: [],
    referralsCompleted: [],
    activationStillPending: [],
    walletStillPending: [],
  }

  const token = runPayments ? await getMonnifyToken() : null

  const webhookSnap = await db.collection("processedWebhooks")
    .where("eventType", "==", "TRANSACTION_COMPLETION")
    .limit(1000)
    .get()
  const paidWebhookRefs = new Set()
  webhookSnap.docs.forEach((doc) => {
    const data = doc.data()
    if (isPaidStatus(data.status || data.paymentStatus)) {
      extractRefs(data, Array.isArray(data.referenceCandidates) ? data.referenceCandidates : []).forEach((ref) => paidWebhookRefs.add(ref))
    }
  })

  console.log(`[audit] starting ${dryRun ? "dry-run" : "backfill"} with limit ${maxItems}`)

  const activationSnap = runPayments ? await db.collection("activationAttempts").where("status", "==", "pending").limit(maxItems).get() : { size: 0, docs: [] }
  console.log(`[audit] pending activation attempts loaded: ${activationSnap.size}`)
  for (const attemptDoc of activationSnap.docs) {
    const attempt = attemptDoc.data()
    const role = String(attempt.role || "") === "advertiser" ? "advertiser" : "earner"
    const userId = String(attempt.userId || "")
    const attemptedAt = asDate(attempt.attemptedAt) || asDate(attempt.updatedAt)
    if (!userId || (attemptedAt && attemptedAt < cutoff)) continue

    const refs = normalizeReferences([attempt.reference, ...(Array.isArray(attempt.references) ? attempt.references : [])])
    if (refs.length === 0) continue
    const userSnap = await db.collection(role === "advertiser" ? "advertisers" : "earners").doc(userId).get()
    if (!userSnap.exists || userSnap.data().activated) {
      if (userSnap.exists) await completePendingReferrals(db, FieldValue, userId, "referral-backfill-activated-user", report)
      continue
    }

    const webhookPaid = refs.some((ref) => paidWebhookRefs.has(ref))
    let paidRefs = refs
    let source = webhookPaid ? "paid-webhook-backfill" : ""
    if (!webhookPaid) {
      for (const ref of refs) {
        const verified = await verifyMonnifyReference(token, ref, searchCache)
        if (verified?.paid) {
          paidRefs = normalizeReferences([...refs, ...verified.refs])
          source = "monnify-verified-backfill"
          break
        }
      }
    }

    if (source) {
      if (dryRun) {
        report.activationsRecovered.push({ role, userId, reference: paidRefs[0], references: paidRefs, source: `${source}:dry-run` })
      } else {
        await completeActivation(db, FieldValue, role, userId, paidRefs[0], paidRefs, String(attempt.provider || "monnify"), source, report)
      }
    } else {
      report.activationStillPending.push({ role, userId, references: refs, attemptedAt: attemptedAt ? attemptedAt.toISOString() : null })
    }
  }

  const pendingActivationUserSnaps = runPayments ? await Promise.all([
    db.collection("earners")
      .where("activated", "==", false)
      .where("activationAttemptedAt", ">=", cutoff)
      .orderBy("activationAttemptedAt", "desc")
      .limit(maxItems)
      .get(),
    db.collection("advertisers")
      .where("activated", "==", false)
      .where("activationAttemptedAt", ">=", cutoff)
      .orderBy("activationAttemptedAt", "desc")
      .limit(maxItems)
      .get(),
  ]) : [{ size: 0, docs: [] }, { size: 0, docs: [] }]
  const pendingActivationUserCount = pendingActivationUserSnaps.reduce((total, snap) => total + snap.size, 0)
  console.log(`[audit] pending activation users loaded: ${pendingActivationUserCount}`)
  for (const userSnap of pendingActivationUserSnaps) {
    for (const userDoc of userSnap.docs) {
      const user = userDoc.data()
      const role = userDoc.ref.parent.id === "earners" ? "earner" : "advertiser"
      const userId = userDoc.id
      const refs = normalizeReferences([
        user.pendingActivationReference,
        ...(Array.isArray(user.pendingActivationReferences) ? user.pendingActivationReferences : []),
        user.activationReference,
        ...(Array.isArray(user.activationReferences) ? user.activationReferences : []),
      ])
      if (refs.length === 0) continue

      const webhookPaid = refs.some((ref) => paidWebhookRefs.has(ref))
      let paidRefs = refs
      let source = webhookPaid ? "paid-webhook-backfill" : ""
      if (!webhookPaid) {
        for (const ref of refs) {
          const verified = await verifyMonnifyReference(token, ref, searchCache)
          if (verified?.paid) {
            paidRefs = normalizeReferences([...refs, ...verified.refs])
            source = "monnify-verified-backfill"
            break
          }
        }
      }

      if (source) {
        if (dryRun) {
          report.activationsRecovered.push({ role, userId, reference: paidRefs[0], references: paidRefs, source: `${source}:dry-run` })
        } else {
          await completeActivation(db, FieldValue, role, userId, paidRefs[0], paidRefs, String(user.pendingActivationProvider || user.activationPaymentProvider || "monnify"), source, report)
        }
      } else {
        report.activationStillPending.push({ role, userId, references: refs, attemptedAt: user.activationAttemptedAt ? String(user.activationAttemptedAt) : null })
      }
    }
  }

  const walletSnap = runPayments ? await db.collection("advertiserTransactions")
    .where("type", "==", "wallet_funding")
    .where("status", "==", "pending")
    .limit(maxItems)
    .get() : { size: 0, docs: [] }
  console.log(`[audit] pending wallet fundings loaded: ${walletSnap.size}`)
  for (const txDoc of walletSnap.docs) {
    const data = txDoc.data()
    const createdAt = asDate(data.createdAt)
    if (createdAt && createdAt < cutoff) continue
    const refs = normalizeReferences([data.reference, ...(Array.isArray(data.referenceCandidates) ? data.referenceCandidates : [])])
    if (refs.length === 0) continue

    const webhookPaid = refs.some((ref) => paidWebhookRefs.has(ref))
    let paidRefs = refs
    let source = webhookPaid ? "paid-webhook-backfill" : ""
    if (!webhookPaid) {
      for (const ref of refs) {
        const verified = await verifyMonnifyReference(token, ref, searchCache)
        if (verified?.paid) {
          paidRefs = normalizeReferences([...refs, ...verified.refs])
          source = "monnify-verified-backfill"
          break
        }
      }
    }

    if (source) {
      if (dryRun) {
        report.walletRecovered.push({
          transactionId: txDoc.id,
          userId: String(data.userId || ""),
          amount: Number(data.amount || 0),
          reference: paidRefs[0] || String(data.reference || ""),
          references: paidRefs,
          source: `${source}:dry-run`,
        })
      } else {
        await completeWalletFunding(db, FieldValue, txDoc, paidRefs, source, report)
      }
    } else {
      report.walletStillPending.push({
        transactionId: txDoc.id,
        userId: String(data.userId || ""),
        amount: Number(data.amount || 0),
        references: refs,
        createdAt: createdAt ? createdAt.toISOString() : null,
      })
    }
  }

  const pendingReferralSnap = runReferrals ? await db.collection("referrals").where("status", "==", "pending").limit(maxItems * 4).get() : { size: 0, docs: [] }
  console.log(`[audit] pending referrals loaded: ${pendingReferralSnap.size}`)
  const referralChunks = chunkArray(pendingReferralSnap.docs, 25)
  for (const chunk of referralChunks) {
    const referralRows = chunk
      .map((referralDoc) => {
        const referral = referralDoc.data()
        const referredId = String(referral.referredId || "")
        return referredId ? { referralDoc, referral, referredId } : null
      })
      .filter((row) => Boolean(row))

    const uniqueReferredIds = [...new Set(referralRows.map((row) => row.referredId))]
    const earnerRefs = uniqueReferredIds.map((referredId) => db.collection("earners").doc(referredId))
    const advertiserRefs = uniqueReferredIds.map((referredId) => db.collection("advertisers").doc(referredId))
    const [earnerSnaps, advertiserSnaps] = await Promise.all([
      db.getAll(...earnerRefs),
      db.getAll(...advertiserRefs),
    ])

    const activationById = new Map()
    uniqueReferredIds.forEach((referredId, index) => {
      const earnerSnap = earnerSnaps[index]
      const advertiserSnap = advertiserSnaps[index]
      activationById.set(
        referredId,
        Boolean((earnerSnap?.exists && earnerSnap.data()?.activated) || (advertiserSnap?.exists && advertiserSnap.data()?.activated))
      )
    })

    await Promise.all(referralRows.map(async ({ referralDoc, referral, referredId }) => {
      if (!activationById.get(referredId)) return
      if (dryRun) {
        report.referralsCompleted.push({
          referralId: referralDoc.id,
          referredId,
          referrerId: String(referral.referrerId || ""),
          amount: Number(referral.amount || 0),
          source: "referral-backfill-activated-user:dry-run",
        })
      } else {
        await completePendingReferrals(db, FieldValue, referredId, "referral-backfill-activated-user", report)
      }
    }))
  }

  const reportDir = path.join(process.cwd(), "reports")
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir)
  const reportPath = path.join(reportDir, `payment_referral_backfill_${new Date().toISOString().slice(0, 10)}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    reportPath,
    activationsRecovered: report.activationsRecovered.length,
    walletRecovered: report.walletRecovered.length,
    referralsCompleted: report.referralsCompleted.length,
    activationStillPending: report.activationStillPending.length,
    walletStillPending: report.walletStillPending.length,
  }, null, 2))

  await Promise.all(admin.apps.map((app) => app.delete().catch(() => null)))
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
