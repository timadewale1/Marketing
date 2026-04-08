import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { processWalletFundingWithRetry, runFullActivationFlow } from "@/lib/paymentProcessing"
import { verifyTransaction as verifyMonnifyTransaction } from "@/services/monnify"

type PaymentProvider = "monnify" | "paystack"
type VerificationState = "paid" | "manual_check" | "unverified"

function serializeDate(value: unknown) {
  if (value && typeof value === "object" && "toDate" in (value as Record<string, unknown>)) {
    return ((value as { toDate: () => Date }).toDate()).toISOString()
  }
  if (value instanceof Date) return value.toISOString()
  return value ?? null
}

function normalizeProvider(value: unknown): PaymentProvider | null {
  return String(value || "").toLowerCase() === "paystack" ? "paystack" : String(value || "").toLowerCase() === "monnify" ? "monnify" : null
}

function normalizeReferences(values: unknown[]) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
}

function getProcessedWebhookReferences(data: { reference?: unknown; referenceCandidates?: unknown }) {
  const arrayReferences = Array.isArray(data.referenceCandidates) ? data.referenceCandidates : []
  return normalizeReferences([data.reference, ...arrayReferences])
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

  if (paymentStatus === "PAID" || paymentStatus === "SUCCESS" || paymentStatus === "SUCCESSFUL") {
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

  if (successfulWebhookReferences) {
    for (const reference of uniqueReferences) {
      if (successfulWebhookReferences.has(reference)) {
        return "paid"
      }
    }
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

export async function runRecoverySweep() {
  const { dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin) {
    throw new Error("Firebase not initialized")
  }

  const [earnersSnap, advertisersSnap, pendingWalletSnap, processedWebhookSnap, activationAttemptsSnap] = await Promise.all([
    dbAdmin.collection("earners").get(),
    dbAdmin.collection("advertisers").get(),
    dbAdmin.collection("advertiserTransactions").where("type", "==", "wallet_funding").where("status", "==", "pending").get(),
    dbAdmin.collection("processedWebhooks").where("eventType", "==", "TRANSACTION_COMPLETION").get(),
    dbAdmin.collection("activationAttempts").get(),
  ])

  const activationAttemptsByUser = new Map<string, {
    references: string[]
    providerHint: string | null
    activationAttemptedAt: string | null
    name: string
    email: string
  }>()

  for (const doc of activationAttemptsSnap.docs) {
    const data = doc.data()
    const userId = String(data.userId || "")
    const role = String(data.role || "") === "advertiser" ? "advertiser" : String(data.role || "") === "earner" ? "earner" : null
    if (!userId || !role) continue
    if (String(data.status || "").toLowerCase() === "completed") continue

    const key = `${role}:${userId}`
    const previous = activationAttemptsByUser.get(key)
    const references = normalizeReferences([data.reference, ...(Array.isArray(data.references) ? data.references : [])])
    if (references.length === 0 && !previous) continue

    activationAttemptsByUser.set(key, {
      references: normalizeReferences([...(previous?.references || []), ...references]),
      providerHint: String(data.provider || previous?.providerHint || "") || null,
      activationAttemptedAt:
        (serializeDate(data.attemptedAt) as string | null) ||
        (serializeDate(data.updatedAt) as string | null) ||
        previous?.activationAttemptedAt ||
        null,
      name: String(data.name || previous?.name || ""),
      email: String(data.email || previous?.email || "").trim().toLowerCase(),
    })
  }

  const successfulWebhookReferences = new Set(
    processedWebhookSnap.docs
      .filter((doc) => {
        const status = String(doc.data().status || "").toUpperCase()
        return status === "SUCCESS" || status === "SUCCESSFUL"
      })
      .flatMap((doc) => getProcessedWebhookReferences(doc.data()))
  )
  const verificationCache = new Map<string, Promise<VerificationState>>()

  const activationCandidates = (await Promise.all(
    [...earnersSnap.docs.map((doc) => ({ doc, role: "earner" as const })), ...advertisersSnap.docs.map((doc) => ({ doc, role: "advertiser" as const }))]
      .map(async ({ doc, role }) => {
        const data = doc.data()
        if (data.activated) return null
        const attemptInfo = activationAttemptsByUser.get(`${role}:${doc.id}`)
        const references = normalizeReferences([
          data.pendingActivationReference,
          ...(Array.isArray(data.pendingActivationReferences) ? data.pendingActivationReferences : []),
          data.activationReference,
          ...(Array.isArray(data.activationReferences) ? data.activationReferences : []),
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
      }
    })
  )).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))

  let activationRecovered = 0
  for (const candidate of activationCandidates) {
    if (candidate.verificationState !== "paid") continue
    try {
      await runFullActivationFlow(candidate.id, candidate.references[0], candidate.provider, candidate.role, candidate.references)
      activationRecovered += 1
    } catch (error) {
      console.error("[recovery-sweep] activation recovery failed", { candidate, error })
    }
  }

  let walletRecovered = 0
  for (const candidate of walletCandidates) {
    if (candidate.verificationState !== "paid") continue
    try {
      await processWalletFundingWithRetry(candidate.advertiserId, candidate.reference, candidate.amount, candidate.provider, "advertiser", 3, candidate.references)
      walletRecovered += 1
    } catch (error) {
      console.error("[recovery-sweep] wallet recovery failed", { candidate, error })
    }
  }

  return {
    activationRecovered,
    walletRecovered,
    checked: {
      activation: activationCandidates.length,
      wallet: walletCandidates.length,
    },
  }
}
