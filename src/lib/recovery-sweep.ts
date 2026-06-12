import * as admin from "firebase-admin"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { processWalletFundingWithRetry, runFullActivationFlow } from "@/lib/paymentProcessing"
import { logPaymentLifecycle } from "@/lib/payment-reconciliation"
import { verifyTransaction as verifyMonnifyTransaction } from "@/services/monnify"

type PaymentProvider = "monnify" | "paystack"
type VerificationState = "paid" | "manual_check" | "unverified"
type ProcessedWebhookRecord = {
  reference?: unknown
  referenceCandidates?: unknown
  status?: unknown
  paymentStatus?: unknown
}

const TX_ONLY_MAX_AUTO_RETRIES = 3
const TX_ONLY_MAX_AUTO_AGE_MS = 12 * 60 * 60 * 1000
const RECOVERY_SWEEP_BATCH_LIMIT = 50

const MONNIFY_MAX_AUTO_RETRIES = 6
const MONNIFY_MAX_AUTO_AGE_MS = 36 * 60 * 60 * 1000
const RECOVERY_AUTO_CHECK_LIMIT = 4
const RECOVERY_AUTO_RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

function serializeDate(value: unknown) {
  if (value && typeof value === "object" && "toDate" in (value as Record<string, unknown>)) {
    return ((value as { toDate: () => Date }).toDate()).toISOString()
  }
  if (value instanceof Date) return value.toISOString()
  return value ?? null
}

function asDate(value: unknown) {
  if (value && typeof value === "object" && "toDate" in (value as Record<string, unknown>)) {
    return ((value as { toDate: () => Date }).toDate())
  }
  if (value instanceof Date) return value
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function normalizeProvider(value: unknown): PaymentProvider | null {
  return String(value || "").toLowerCase() === "paystack" ? "paystack" : String(value || "").toLowerCase() === "monnify" ? "monnify" : null
}

function normalizeReferences(values: unknown[]) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
}

function getProcessedWebhookReferences(data: ProcessedWebhookRecord) {
  return normalizeReferences([
    data.reference,
    ...(Array.isArray(data.referenceCandidates) ? data.referenceCandidates : []),
  ])
}

async function buildSuccessfulWebhookReferences(dbAdmin: FirebaseFirestore.Firestore) {
  const processedWebhookSnap = await dbAdmin
    .collection("processedWebhooks")
    .where("eventType", "==", "TRANSACTION_COMPLETION")
    .limit(1000)
    .get()

  return new Set(
    processedWebhookSnap.docs
      .filter((doc) => {
        const status = String(doc.data().status || doc.data().paymentStatus || "").toUpperCase()
        return status === "PAID" || status === "SUCCESS" || status === "SUCCESSFUL"
      })
      .flatMap((doc) => {
        const data = doc.data() as ProcessedWebhookRecord
        const primaryReference = String(data.reference || "").trim()
        return primaryReference ? [primaryReference] : getProcessedWebhookReferences(data).slice(0, 1)
      })
  )
}

function hasFinalMonnifyReference(references: string[]) {
  return references.some((reference) => reference.toUpperCase().startsWith("MNFY|"))
}

function hasOnlyTxLikeReferences(references: string[]) {
  return references.length > 0 && references.every((reference) => reference.toUpperCase().startsWith("TX_"))
}

function shouldEscalateToManualReview({
  references,
  retryCount,
  firstSeenAt,
}: {
  references: string[]
  retryCount: number
  firstSeenAt: Date
}) {
  const ageMs = Date.now() - firstSeenAt.getTime()
  if (hasFinalMonnifyReference(references)) {
    return retryCount >= MONNIFY_MAX_AUTO_RETRIES || ageMs >= MONNIFY_MAX_AUTO_AGE_MS
  }
  if (hasOnlyTxLikeReferences(references)) {
    return retryCount >= TX_ONLY_MAX_AUTO_RETRIES || ageMs >= TX_ONLY_MAX_AUTO_AGE_MS
  }
  return retryCount >= TX_ONLY_MAX_AUTO_RETRIES || ageMs >= TX_ONLY_MAX_AUTO_AGE_MS
}

async function verifyPaystackPayment(reference: string) {
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (!secret || !reference) return false

  const encodedReference = encodeURIComponent(reference)
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodedReference}`, {
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
    },
    cache: "no-store",
  })

  const payload = await response.json().catch(() => null) as
    | { status?: boolean; data?: { status?: string } }
    | null

  return Boolean(response.ok && payload?.status && payload.data?.status === "success")
}

function resolveMonnifyVerificationState(payload: unknown): VerificationState {
  const responseBody = payload && typeof payload === "object"
    ? (payload as { responseBody?: { paymentStatus?: unknown; status?: unknown } }).responseBody
    : undefined
  const paymentStatus = String(responseBody?.paymentStatus || responseBody?.status || "").toUpperCase()

  if (paymentStatus === "PAID" || paymentStatus === "SUCCESS" || paymentStatus === "SUCCESSFUL" || paymentStatus === "COMPLETED") {
    return "paid"
  }

  if (paymentStatus === "PENDING" || paymentStatus === "PROCESSING" || paymentStatus === "INITIATED" || paymentStatus === "IN_PROGRESS") {
    return "manual_check"
  }

  return "unverified"
}

async function verifyProviderPaymentState(reference: string, provider: PaymentProvider): Promise<VerificationState> {
  if (!reference) return "unverified"

  if (provider === "paystack") {
    return (await verifyPaystackPayment(reference)) ? "paid" : "unverified"
  }

  try {
    const payload = await verifyMonnifyTransaction(reference)
    return payload?.requestSuccessful ? resolveMonnifyVerificationState(payload) : "unverified"
  } catch {
    return "unverified"
  }
}

async function resolveRecoveryVerificationState(
  references: string[],
  providerHint: unknown,
  verificationCache: Map<string, Promise<VerificationState>>,
  successfulWebhookReferences?: Set<string>,
): Promise<VerificationState> {
  const uniqueReferences = [...new Set(references.map((value) => String(value || "").trim()).filter(Boolean))]
  if (uniqueReferences.length === 0) return "unverified"

  if (successfulWebhookReferences && uniqueReferences.some((reference) => successfulWebhookReferences.has(reference))) {
    return "paid"
  }

  const hintedProvider = normalizeProvider(providerHint)
  const providersToTry: PaymentProvider[] = hintedProvider
    ? hintedProvider === "monnify"
      ? ["monnify", "paystack"]
      : ["paystack", "monnify"]
    : ["monnify", "paystack"]

  let sawManualCheck = false
  const monnifyLikeReferences = uniqueReferences.filter((reference) => reference.toUpperCase().startsWith("TX_"))

  for (const reference of uniqueReferences) {
    for (const provider of providersToTry) {
      const cacheKey = `${provider}:${reference}`
      let verification = verificationCache.get(cacheKey)
      if (!verification) {
        verification = verifyProviderPaymentState(reference, provider)
        verificationCache.set(cacheKey, verification)
      }

      const state = await verification
      if (state === "paid") return "paid"
      if (state === "manual_check") sawManualCheck = true
    }
  }

  if (sawManualCheck) return "manual_check"
  if (monnifyLikeReferences.length > 0) return "manual_check"

  return "unverified"
}

/**
 * Recovery sweep - processes pending payments that have been verified as PAID by the provider.
 * 
 * ⚠️ CRITICAL BEHAVIOR:
 * - Only processes payments that have been VERIFIED as PAID/SUCCESS/COMPLETED by the payment provider
 * - Does NOT process unverified, failed, or incomplete payments
 * - Called immediately when pending payments are detected (via Firestore triggers)
 * - Also runs on a scheduled basis as a fallback
 * 
 * Flow:
 * 1. Collects all pending wallet funding and activation attempts
 * 2. For each pending payment, verifies its status with the payment provider (Monnify/Paystack)
 * 3. If verified as PAID: immediately processes activation or wallet funding
 * 4. If NOT verified as PAID: defers for retry later or escalates to manual review
 * 
 * This ensures:
 * - Users only get credited when payment is confirmed by the provider
 * - No double-crediting or processing of unconfirmed payments
 * - Immediate activation/funding once payment is confirmed
 */
export async function runRecoverySweep() {
  const { dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin) {
    throw new Error("Firebase not initialized")
  }

  await logPaymentLifecycle({
    scope: "recovery",
    status: "retry_started",
    source: "recovery-sweep",
  })

  const [pendingWalletSnap, activationAttemptsSnap, successfulWebhookReferences] = await Promise.all([
    dbAdmin.collection("advertiserTransactions").where("type", "==", "wallet_funding").where("status", "==", "pending").limit(RECOVERY_SWEEP_BATCH_LIMIT).get(),
    dbAdmin.collection("activationAttempts").where("status", "==", "pending").limit(RECOVERY_SWEEP_BATCH_LIMIT).get(),
    buildSuccessfulWebhookReferences(dbAdmin),
  ])

  console.log(`[recovery-sweep] Initial query results: ${pendingWalletSnap.docs.length} pending wallet, ${activationAttemptsSnap.docs.length} pending activations`)

  if (pendingWalletSnap.empty && activationAttemptsSnap.empty) {
    await logPaymentLifecycle({
      scope: "recovery",
      status: "retry_completed",
      source: "recovery-sweep",
      details: {
        activationRecovered: 0,
        walletRecovered: 0,
        activationChecked: 0,
        walletChecked: 0,
        activationDeferred: 0,
        walletDeferred: 0,
        activationEscalated: 0,
        walletEscalated: 0,
      },
    })

    return {
      activationRecovered: 0,
      walletRecovered: 0,
      checked: { activation: 0, wallet: 0 },
      deferred: { activation: 0, wallet: 0 },
      escalated: { activation: 0, wallet: 0 },
    }
  }

  const activationAttemptsByUser = new Map<string, {
    docId: string
    references: string[]
    providerHint: string | null
    activationAttemptedAt: string | null
    name: string
    email: string
    retryCount: number
    nextCheckAt: Date | null
    disposition: string | null
    autoChecksLocked: boolean
  }>()

  for (const doc of activationAttemptsSnap.docs) {
    const data = doc.data()
    const userId = String(data.userId || "")
    const role = String(data.role || "") === "advertiser" ? "advertiser" : String(data.role || "") === "earner" ? "earner" : null
    
    // Log filtering details for debugging
    if (!userId || !role) {
      console.log(`[recovery-sweep] Skipping activationAttempt ${doc.id}: missing userId or role`, {
        docId: doc.id,
        userId,
        rawRole: data.role,
        role,
        hasUserId: !!data.userId,
        hasRole: !!data.role,
        status: data.status
      })
      continue
    }
    
    const key = `${role}:${userId}`
    const previous = activationAttemptsByUser.get(key)
    const references = normalizeReferences([data.reference, ...(Array.isArray(data.references) ? data.references : [])])
    
    if (references.length === 0 && !previous) {
      console.log(`[recovery-sweep] Skipping activationAttempt ${doc.id}: no payment reference`, {
        docId: doc.id,
        userId,
        role,
        reference: data.reference,
        references: data.references,
        status: data.status
      })
      continue
    }

      activationAttemptsByUser.set(key, {
        docId: doc.id,
        references: normalizeReferences([...(previous?.references || []), ...references]),
        providerHint: String(data.provider || previous?.providerHint || "") || null,
        activationAttemptedAt:
        (serializeDate(data.attemptedAt) as string | null) ||
        (serializeDate(data.updatedAt) as string | null) ||
        previous?.activationAttemptedAt ||
        null,
      name: String(data.name || previous?.name || ""),
      email: String(data.email || previous?.email || "").trim().toLowerCase(),
        retryCount: Math.max(
          Number(previous?.retryCount || 0),
          Number(data.recoveryRetryCount || 0),
        ),
        nextCheckAt: previous?.nextCheckAt || asDate(data.nextRecoveryCheckAt),
        disposition: String(data.recoveryDisposition || previous?.disposition || "") || null,
        autoChecksLocked: Boolean(data.recoveryAutoChecksLocked || previous?.autoChecksLocked || false),
      })
    }

  const verificationCache = new Map<string, Promise<VerificationState>>()

  const earnerIds = new Set<string>()
  const advertiserIds = new Set<string>()
  for (const key of activationAttemptsByUser.keys()) {
    const [role, userId] = key.split(":")
    if (role === "earner" && userId) earnerIds.add(userId)
    if (role === "advertiser" && userId) advertiserIds.add(userId)
  }

  const fetchUsers = async (role: "earner" | "advertiser", ids: string[]) => {
    if (ids.length === 0) return []
    const refs = ids.map((id) => dbAdmin.collection(role === "earner" ? "earners" : "advertisers").doc(id))
    const snaps = await dbAdmin.getAll(...refs)
    return snaps.map((doc) => ({ doc, role }))
  }

  const [earnerDocs, advertiserDocs] = await Promise.all([
    fetchUsers("earner", Array.from(earnerIds)),
    fetchUsers("advertiser", Array.from(advertiserIds)),
  ])

  const activationCandidates = (await Promise.all(
    [...earnerDocs, ...advertiserDocs]
      .map(async ({ doc, role }) => {
        if (!doc.exists) return null
        const data = doc.data() || {}
        if (data.activated) return null
        const attemptInfo = activationAttemptsByUser.get(`${role}:${doc.id}`)
        const references = normalizeReferences([
          data.pendingActivationReference,
          ...(Array.isArray(data.pendingActivationReferences) ? data.pendingActivationReferences : []),
          ...(attemptInfo?.references || []),
        ])
        if (references.length === 0) return null

        const verificationState = await resolveRecoveryVerificationState(
          references,
          data.pendingActivationProvider || data.activationPaymentProvider || attemptInfo?.providerHint || null,
          verificationCache,
          successfulWebhookReferences,
        )

        return {
          id: doc.id,
          role,
          references,
          provider: String(data.pendingActivationProvider || data.activationPaymentProvider || attemptInfo?.providerHint || "monnify"),
          verificationState,
          attemptDocId: attemptInfo?.docId || null,
          retryCount: Number(attemptInfo?.retryCount || 0),
          nextCheckAt: attemptInfo?.nextCheckAt || null,
          attemptedAt: asDate(data.activationAttemptedAt) || asDate(attemptInfo?.activationAttemptedAt),
          disposition: attemptInfo?.disposition || null,
          autoChecksLocked: Boolean(data.recoveryAutoChecksLocked || attemptInfo?.autoChecksLocked || false),
        }
      })
  )).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))

  const walletCandidates = (await Promise.all(
    pendingWalletSnap.docs.map(async (txDoc) => {
      const data = txDoc.data()
      const advertiserId = String(data.userId || "")
      if (!advertiserId) return null
      const references = normalizeReferences([data.reference, ...(Array.isArray(data.referenceCandidates) ? data.referenceCandidates : [])])
      const verificationState = await resolveRecoveryVerificationState(
        references,
        data.provider || "monnify",
        verificationCache,
        successfulWebhookReferences,
      )

      return {
        id: txDoc.id,
        advertiserId,
        amount: Number(data.amount || 0),
        provider: String(data.provider || "monnify"),
        reference: references[0] || "",
        references,
        verificationState,
        retryCount: Number(data.recoveryRetryCount || 0),
        nextCheckAt: asDate(data.nextRecoveryCheckAt),
        createdAt: asDate(data.createdAt),
        disposition: String(data.recoveryDisposition || "") || null,
        autoChecksLocked: Boolean(data.recoveryAutoChecksLocked || false),
      }
    })
  )).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))

  let activationRecovered = 0
  let activationChecked = 0
  let activationDeferred = 0
  let activationEscalated = 0
  // IMPORTANT: Only process activations verified as PAID by the payment provider
  for (const candidate of activationCandidates) {
    if (candidate.autoChecksLocked) continue
    if (candidate.nextCheckAt && candidate.nextCheckAt.getTime() > Date.now()) continue
    if (!candidate.attemptDocId) continue
    activationChecked += 1
    // ⚠️ CRITICAL: Only process if payment provider confirms PAID status
    if (candidate.verificationState !== "paid") {
      console.log(`[recovery-sweep] Skipping activation ${candidate.id}: verification state is '${candidate.verificationState}' (not 'paid')`, {
        references: candidate.references,
        provider: candidate.provider,
      })
      continue
    }
    console.log(`[recovery-sweep] Processing verified PAID activation: ${candidate.id}`, {
      references: candidate.references,
      provider: candidate.provider,
    })
    try {
      await logPaymentLifecycle({
        scope: "activation",
        status: "retry_started",
        source: "recovery-sweep",
        provider: candidate.provider,
        role: candidate.role,
        userId: candidate.id,
        reference: candidate.references[0] || null,
        references: candidate.references,
      })
      await runFullActivationFlow(candidate.id, candidate.references[0], candidate.provider, candidate.role, candidate.references)
      activationRecovered += 1
      await logPaymentLifecycle({
        scope: "activation",
        status: "retry_completed",
        source: "recovery-sweep",
        provider: candidate.provider,
        role: candidate.role,
        userId: candidate.id,
        reference: candidate.references[0] || null,
        references: candidate.references,
      })
    } catch (error) {
      console.error("[recovery-sweep] activation recovery failed", { candidate, error })
      await logPaymentLifecycle({
        scope: "activation",
        status: "retry_failed",
        source: "recovery-sweep",
        provider: candidate.provider,
        role: candidate.role,
        userId: candidate.id,
        reference: candidate.references[0] || null,
        references: candidate.references,
        details: { message: error instanceof Error ? error.message : String(error) },
      })
    }
  }

  for (const candidate of activationCandidates) {
    if (candidate.verificationState === "paid") continue
    if (candidate.nextCheckAt && candidate.nextCheckAt.getTime() > Date.now()) continue
    if (!candidate.attemptDocId) continue

    const attemptRef = dbAdmin.collection("activationAttempts").doc(candidate.attemptDocId)
    const nextRetryCount = candidate.retryCount + 1
    const firstSeenAt = candidate.attemptedAt || new Date()
    const isManualReview = candidate.disposition === "manual_review"
    const autoChecksLocked = nextRetryCount >= RECOVERY_AUTO_CHECK_LIMIT
    const escalate = !isManualReview && shouldEscalateToManualReview({
      references: candidate.references,
      retryCount: nextRetryCount,
      firstSeenAt,
    })

    await attemptRef.set({
      lastRecoveryCheckedAt: new Date(),
      lastRecoveryVerificationState: candidate.verificationState,
      recoveryRetryCount: nextRetryCount,
      recoveryDisposition: isManualReview ? "manual_review" : (escalate ? "manual_review" : "scheduled"),
      nextRecoveryCheckAt: autoChecksLocked ? admin.firestore.FieldValue.delete() : new Date(Date.now() + RECOVERY_AUTO_RECHECK_INTERVAL_MS),
      recoveryEscalatedAt: escalate ? new Date() : null,
      recoveryEscalationReason: escalate ? "Activation payment remained unresolved after automatic retries" : null,
      recoveryAutoChecksLocked: autoChecksLocked,
      updatedAt: new Date(),
    }, { merge: true })

    if (escalate) activationEscalated += 1
    else activationDeferred += 1
  }

  let walletRecovered = 0
  let walletChecked = 0
  let walletDeferred = 0
  let walletEscalated = 0
  // IMPORTANT: Only process wallet funding verified as PAID by the payment provider
  for (const candidate of walletCandidates) {
    if (candidate.autoChecksLocked) continue
    if (candidate.nextCheckAt && candidate.nextCheckAt.getTime() > Date.now()) continue
    walletChecked += 1
    // ⚠️ CRITICAL: Only process if payment provider confirms PAID status
    if (candidate.verificationState !== "paid") {
      console.log(`[recovery-sweep] Skipping wallet funding ${candidate.id}: verification state is '${candidate.verificationState}' (not 'paid')`, {
        references: candidate.references,
        provider: candidate.provider,
        amount: candidate.amount,
      })
      continue
    }
    console.log(`[recovery-sweep] Processing verified PAID wallet funding: ${candidate.id}`, {
      references: candidate.references,
      provider: candidate.provider,
      amount: candidate.amount,
    })
    try {
      await logPaymentLifecycle({
        scope: "wallet_funding",
        status: "retry_started",
        source: "recovery-sweep",
        provider: candidate.provider,
        role: "advertiser",
        userId: candidate.advertiserId,
        transactionId: candidate.id,
        reference: candidate.reference,
        references: candidate.references,
        amount: candidate.amount,
      })
      await processWalletFundingWithRetry(candidate.advertiserId, candidate.reference, candidate.amount, candidate.provider, "advertiser", 3, candidate.references)
      walletRecovered += 1
      await logPaymentLifecycle({
        scope: "wallet_funding",
        status: "retry_completed",
        source: "recovery-sweep",
        provider: candidate.provider,
        role: "advertiser",
        userId: candidate.advertiserId,
        transactionId: candidate.id,
        reference: candidate.reference,
        references: candidate.references,
        amount: candidate.amount,
      })
    } catch (error) {
      console.error("[recovery-sweep] wallet recovery failed", { candidate, error })
      await logPaymentLifecycle({
        scope: "wallet_funding",
        status: "retry_failed",
        source: "recovery-sweep",
        provider: candidate.provider,
        role: "advertiser",
        userId: candidate.advertiserId,
        transactionId: candidate.id,
        reference: candidate.reference,
        references: candidate.references,
        amount: candidate.amount,
        details: { message: error instanceof Error ? error.message : String(error) },
      })
    }
  }

  for (const candidate of walletCandidates) {
    if (candidate.verificationState === "paid") continue
    if (candidate.nextCheckAt && candidate.nextCheckAt.getTime() > Date.now()) continue

    const txRef = dbAdmin.collection("advertiserTransactions").doc(candidate.id)
    const nextRetryCount = candidate.retryCount + 1
    const firstSeenAt = candidate.createdAt || new Date()
    const isManualReview = candidate.disposition === "manual_review"
    const autoChecksLocked = nextRetryCount >= RECOVERY_AUTO_CHECK_LIMIT
    const escalate = !isManualReview && shouldEscalateToManualReview({
      references: candidate.references,
      retryCount: nextRetryCount,
      firstSeenAt,
    })

    await txRef.set({
      lastRecoveryCheckedAt: new Date(),
      lastRecoveryVerificationState: candidate.verificationState,
      verificationState: candidate.verificationState,
      recoveryRetryCount: nextRetryCount,
      recoveryDisposition: isManualReview ? "manual_review" : (escalate ? "manual_review" : "scheduled"),
      nextRecoveryCheckAt: autoChecksLocked ? admin.firestore.FieldValue.delete() : new Date(Date.now() + RECOVERY_AUTO_RECHECK_INTERVAL_MS),
      recoveryEscalatedAt: escalate ? new Date() : null,
      recoveryEscalationReason: escalate ? "Wallet funding remained unresolved after automatic retries" : null,
      recoveryAutoChecksLocked: autoChecksLocked,
    }, { merge: true })

    if (escalate) walletEscalated += 1
    else walletDeferred += 1
  }

  await logPaymentLifecycle({
    scope: "recovery",
    status: "retry_completed",
    source: "recovery-sweep",
    details: {
      activationRecovered,
      walletRecovered,
      activationChecked,
      walletChecked,
      activationDeferred,
      walletDeferred,
      activationEscalated,
      walletEscalated,
    },
  })

  return {
    activationRecovered,
    walletRecovered,
    checked: {
      activation: activationChecked,
      wallet: walletChecked,
    },
    deferred: {
      activation: activationDeferred,
      wallet: walletDeferred,
    },
    escalated: {
      activation: activationEscalated,
      wallet: walletEscalated,
    },
  }
}
