import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/admin-session"
import { getActivationAttemptDocId } from "@/lib/activation-attempts"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { processWalletFundingWithRetry, runFullActivationFlow } from "@/lib/paymentProcessing"
import { findSuccessfulTransactionMatch, verifyTransaction as verifyMonnifyTransaction } from "@/services/monnify"

type UserRole = "earner" | "advertiser"
type PaymentProvider = "monnify" | "paystack"
type VerificationState = "paid" | "manual_check" | "unverified"

type ProcessedWebhookRecord = {
  reference?: unknown
  referenceCandidates?: unknown
  status?: unknown
}

type ActivationAttemptRecord = {
  userId?: unknown
  role?: unknown
  email?: unknown
  name?: unknown
  provider?: unknown
  reference?: unknown
  references?: unknown
  attemptedAt?: unknown
  updatedAt?: unknown
  completedAt?: unknown
  status?: unknown
}

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

function getProcessedWebhookReferences(data: ProcessedWebhookRecord) {
  const arrayReferences = Array.isArray(data.referenceCandidates) ? data.referenceCandidates : []
  return normalizeReferences([
    data.reference,
    ...arrayReferences,
  ])
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
  } catch (error) {
    console.warn("[admin][recovery] failed to verify monnify payment", { reference, error })
    return "unverified"
  }
}

async function resolveRecoveryVerificationState(
  references: string[],
  providerHint: unknown,
  verificationCache: Map<string, Promise<VerificationState>>,
  successfulWebhookReferences?: Set<string>,
  context?: {
    email?: string | null
    amount?: number | null
    notBefore?: string | null
  }
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

  if (sawManualCheck) {
    return "manual_check"
  }

  if (monnifyLikeReferences.length > 0) {
    return "manual_check"
  }

  if (providersToTry.includes("monnify") && context?.email && context?.amount != null) {
    try {
      const transaction = await findSuccessfulTransactionMatch({
        references: uniqueReferences,
        email: context.email,
        amount: context.amount,
        notBefore: context.notBefore || null,
      })
      if (transaction) {
        return "paid"
      }
    } catch (error) {
      console.warn("[admin][recovery] failed contextual monnify verification", {
        references: uniqueReferences,
        email: context.email,
        amount: context.amount,
        notBefore: context.notBefore,
        error,
      })
    }
  }

  return "unverified"
}

async function buildSuccessfulWebhookReferences(dbAdmin: FirebaseFirestore.Firestore) {
  const processedWebhookSnap = await dbAdmin
    .collection("processedWebhooks")
    .where("eventType", "==", "TRANSACTION_COMPLETION")
    .get()

  return new Set(
    processedWebhookSnap.docs
      .filter((doc) => {
        const status = String(doc.data().status || "").toUpperCase()
        return status === "SUCCESS" || status === "SUCCESSFUL"
      })
      .flatMap((doc) => getProcessedWebhookReferences(doc.data()))
  )
}

export async function GET() {
  await requireAdminSession()
  const { dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin) {
    return NextResponse.json({ success: false, message: "Firebase not initialized" }, { status: 500 })
  }

  const [earnersSnap, advertisersSnap, earnerActivationTxSnap, advertiserActivationTxSnap, pendingWalletSnap, processedWebhookSnap, activationAttemptsSnap] = await Promise.all([
    dbAdmin.collection("earners").get(),
    dbAdmin.collection("advertisers").get(),
    dbAdmin.collection("earnerTransactions").where("type", "==", "activation_fee").where("status", "==", "completed").get(),
    dbAdmin.collection("advertiserTransactions").where("type", "==", "activation_fee").where("status", "==", "completed").get(),
    dbAdmin.collection("advertiserTransactions").where("type", "==", "wallet_funding").where("status", "==", "pending").get(),
    dbAdmin.collection("processedWebhooks").where("eventType", "==", "TRANSACTION_COMPLETION").get(),
    dbAdmin.collection("activationAttempts").get(),
  ])

  const activationTxByUser = new Map<string, { reference: string | null; createdAt: string | null }>()
  for (const doc of [...earnerActivationTxSnap.docs, ...advertiserActivationTxSnap.docs]) {
    const data = doc.data()
    const userId = String(data.userId || "")
    if (!userId || activationTxByUser.has(userId)) continue
    activationTxByUser.set(userId, {
      reference: data.reference ? String(data.reference) : null,
      createdAt: serializeDate(data.createdAt) as string | null,
    })
  }

  const verificationCache = new Map<string, Promise<VerificationState>>()
  const successfulWebhookReferences = new Set(
    processedWebhookSnap.docs
      .filter((doc) => {
        const status = String(doc.data().status || "").toUpperCase()
        return status === "SUCCESS" || status === "SUCCESSFUL"
      })
      .flatMap((doc) => getProcessedWebhookReferences(doc.data()))
  )

  const activationAttemptsByUser = new Map<string, {
    references: string[]
    providerHint: string | null
    activationAttemptedAt: string | null
    name: string
    email: string
  }>()
  for (const doc of activationAttemptsSnap.docs) {
    const data = doc.data() as ActivationAttemptRecord
    const userId = String(data.userId || "")
    const role = String(data.role || "") === "advertiser" ? "advertiser" : String(data.role || "") === "earner" ? "earner" : null
    if (!userId || !role) continue
    if (String(data.status || "").toLowerCase() === "completed") continue

    const key = `${role}:${userId}`
    const references = normalizeReferences([
      data.reference,
      ...(Array.isArray(data.references) ? data.references : []),
    ])
    if (references.length === 0) continue

    const previous = activationAttemptsByUser.get(key)
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

  const activationCandidateDrafts = [
    ...earnersSnap.docs.map((doc) => ({ doc, role: "earner" as const })),
    ...advertisersSnap.docs.map((doc) => ({ doc, role: "advertiser" as const })),
  ]
    .map(({ doc, role }) => {
      const data = doc.data()
      const attemptInfo = activationAttemptsByUser.get(`${role}:${doc.id}`)
      const pendingReferences = Array.isArray(data.pendingActivationReferences)
        ? data.pendingActivationReferences.map((value: unknown) => String(value)).filter(Boolean)
        : []
      const activationReferences = Array.isArray(data.activationReferences)
        ? data.activationReferences.map((value: unknown) => String(value)).filter(Boolean)
        : []
      const txInfo = activationTxByUser.get(doc.id)

      const references = [...new Set([
        ...(data.pendingActivationReference ? [String(data.pendingActivationReference)] : []),
        ...pendingReferences,
        ...(data.activationReference ? [String(data.activationReference)] : []),
        ...activationReferences,
        ...(attemptInfo?.references || []),
        ...(txInfo?.reference ? [txInfo.reference] : []),
      ])]

      return {
        id: doc.id,
        role,
        name: String(data.fullName || data.businessName || data.name || data.companyName || attemptInfo?.name || "Unnamed user"),
        email: String(data.email || attemptInfo?.email || "").trim().toLowerCase(),
        activated: Boolean(data.activated),
        pendingActivationReference: data.pendingActivationReference ? String(data.pendingActivationReference) : null,
        activationReference: data.activationReference ? String(data.activationReference) : null,
        activationAttemptedAt: (serializeDate(data.activationAttemptedAt) as string | null) || attemptInfo?.activationAttemptedAt || null,
        activatedAt: serializeDate(data.activatedAt) as string | null,
        providerHint: data.pendingActivationProvider || data.activationPaymentProvider || attemptInfo?.providerHint || null,
        references,
        lastActivationTxAt: txInfo?.createdAt || null,
        hasCompletedActivationTx: Boolean(txInfo?.reference),
        paymentVerified: false,
        verificationState: "unverified" as VerificationState,
      }
    })
    .filter((candidate) => !candidate.activated && candidate.references.length > 0)

  let activationCandidates = (await Promise.all(
    activationCandidateDrafts.map(async (candidate) => {
      if (candidate.hasCompletedActivationTx) {
        return {
          ...candidate,
          paymentVerified: true,
          verificationState: "paid" as VerificationState,
        }
      }

      const verificationState = await resolveRecoveryVerificationState(
        candidate.references,
        candidate.providerHint,
        verificationCache,
        successfulWebhookReferences,
        {
          email: candidate.email || null,
          amount: 2000,
          notBefore: candidate.activationAttemptedAt || candidate.lastActivationTxAt || null,
        }
      )

      return {
        ...candidate,
        paymentVerified: verificationState === "paid",
        verificationState,
      }
    })
  ))
    .sort((a, b) => {
      const verifiedSort = Number(b.paymentVerified) - Number(a.paymentVerified)
      if (verifiedSort !== 0) return verifiedSort
      return (b.activationAttemptedAt || b.lastActivationTxAt || "").localeCompare(a.activationAttemptedAt || a.lastActivationTxAt || "")
    })

  let walletCandidates = await Promise.all(
    pendingWalletSnap.docs.map(async (txDoc) => {
      const data = txDoc.data()
      const txReferences = normalizeReferences([
        data.reference,
        ...(Array.isArray(data.referenceCandidates) ? data.referenceCandidates : []),
      ])
      const reference = txReferences[0] || ""
      const provider = String(data.provider || "monnify")
      const advertiserId = String(data.userId || "")
      const advertiserSnap = advertiserId ? await dbAdmin.collection("advertisers").doc(advertiserId).get() : null
      const advertiser = advertiserSnap?.exists ? advertiserSnap.data() : null
      const verificationState = await resolveRecoveryVerificationState(
        txReferences,
        provider,
        verificationCache,
        successfulWebhookReferences,
        {
          email: String(advertiser?.email || ""),
          amount: Number(data.amount || 0),
          notBefore: serializeDate(data.createdAt) as string | null,
        }
      )

      return {
        id: txDoc.id,
        userId: advertiserId,
        name: String(advertiser?.name || advertiser?.businessName || advertiser?.companyName || "Unnamed advertiser"),
        email: String(advertiser?.email || ""),
        amount: Number(data.amount || 0),
        reference,
        provider,
        status: String(data.status || "pending"),
        paymentVerified: verificationState === "paid",
        verificationState,
        createdAt: serializeDate(data.createdAt) as string | null,
        currentBalance: Number(advertiser?.balance || 0),
      }
    })
  )

  const autoRecoveredActivationIds = new Set<string>()
  for (const candidate of activationCandidates) {
    if (candidate.verificationState !== "paid") continue
    try {
      await runFullActivationFlow(
        candidate.id,
        candidate.references[0],
        String(candidate.providerHint || "monnify"),
        candidate.role,
        candidate.references
      )
      autoRecoveredActivationIds.add(candidate.id)
    } catch (error) {
      console.error("[admin][recovery] failed automatic activation recovery", {
        userId: candidate.id,
        role: candidate.role,
        references: candidate.references,
        error,
      })
    }
  }

  const autoRecoveredWalletIds = new Set<string>()
  for (const candidate of walletCandidates) {
    if (!candidate || candidate.verificationState !== "paid") continue
    try {
      await processWalletFundingWithRetry(
        candidate.userId,
        candidate.reference,
        candidate.amount,
        candidate.provider,
        "advertiser",
        3,
        [candidate.reference]
      )
      autoRecoveredWalletIds.add(candidate.id)
    } catch (error) {
      console.error("[admin][recovery] failed automatic wallet recovery", {
        transactionId: candidate.id,
        userId: candidate.userId,
        reference: candidate.reference,
        amount: candidate.amount,
        error,
      })
    }
  }

  activationCandidates = activationCandidates.filter((candidate) => !autoRecoveredActivationIds.has(candidate.id))
  walletCandidates = walletCandidates.filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate) && !autoRecoveredWalletIds.has(candidate.id))

  return NextResponse.json({
    success: true,
    activationCandidates,
    walletCandidates: walletCandidates.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    autoRecovered: {
      activations: autoRecoveredActivationIds.size,
      walletFunding: autoRecoveredWalletIds.size,
    },
  })
}

export async function POST(req: Request) {
  const adminSession = await requireAdminSession()
  const body = await req.json()
  const action = body?.action as "activate_user" | "complete_wallet_funding" | undefined
  const { dbAdmin, admin } = await initFirebaseAdmin()
  if (!dbAdmin || !admin) {
    return NextResponse.json({ success: false, message: "Firebase not initialized" }, { status: 500 })
  }

  try {
    if (action === "activate_user") {
      const userId = String(body?.userId || "")
      const role = body?.role as UserRole | undefined
      if (!userId || !role) {
        return NextResponse.json({ success: false, message: "Missing user details" }, { status: 400 })
      }

      const userRef = dbAdmin.collection(role === "earner" ? "earners" : "advertisers").doc(userId)
      const userSnap = await userRef.get()
      if (!userSnap.exists) {
        return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
      }

      const data = userSnap.data() || {}
      const attemptSnap = await dbAdmin.collection("activationAttempts").doc(getActivationAttemptDocId(role, userId)).get()
      const attemptData = attemptSnap.exists ? attemptSnap.data() as ActivationAttemptRecord : null
      const references = [...new Set([
        ...(data.pendingActivationReference ? [String(data.pendingActivationReference)] : []),
        ...((Array.isArray(data.pendingActivationReferences) ? data.pendingActivationReferences : []).map((value: unknown) => String(value))),
        ...(data.activationReference ? [String(data.activationReference)] : []),
        ...((Array.isArray(data.activationReferences) ? data.activationReferences : []).map((value: unknown) => String(value))),
        ...normalizeReferences([
          attemptData?.reference,
          ...(Array.isArray(attemptData?.references) ? attemptData?.references : []),
        ]),
      ].filter(Boolean))]

      if (references.length === 0) {
        return NextResponse.json({ success: false, message: "No activation reference found for this user" }, { status: 400 })
      }

      const activationTxCollection = role === "earner" ? "earnerTransactions" : "advertiserTransactions"
      const completedActivationTxSnap = await dbAdmin
        .collection(activationTxCollection)
        .where("userId", "==", userId)
        .where("type", "==", "activation_fee")
        .where("status", "==", "completed")
        .limit(1)
        .get()

      if (completedActivationTxSnap.empty) {
        const verificationCache = new Map<string, Promise<VerificationState>>()
        const successfulWebhookReferences = await buildSuccessfulWebhookReferences(dbAdmin)
        const verificationState = await resolveRecoveryVerificationState(
          references,
          data.pendingActivationProvider || data.activationPaymentProvider || attemptData?.provider || null,
          verificationCache,
          successfulWebhookReferences,
          {
            email: String(data.email || attemptData?.email || "").trim().toLowerCase(),
            amount: 2000,
            notBefore: (serializeDate(data.activationAttemptedAt) as string | null) || (serializeDate(attemptData?.attemptedAt) as string | null),
          }
        )

        if (verificationState !== "paid") {
          console.warn("[admin][recovery] proceeding with manual activation despite unverified payment", {
            userId,
            role,
            references,
            verificationState,
          })
        }
      }

      await runFullActivationFlow(
        userId,
        references[0],
        String(data.pendingActivationProvider || data.activationPaymentProvider || "monnify"),
        role,
        references
      )

      await dbAdmin.collection("adminNotifications").add({
        type: "activation_recovered",
        title: "Activation recovered",
        body: `${String(data.fullName || data.businessName || data.name || data.companyName || userId)} was manually activated by admin recovery`,
        link: role === "earner" ? `/admin/earners/${userId}` : `/admin/advertisers/${userId}`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        actor: adminSession.email,
        userId,
      })

      return NextResponse.json({ success: true, message: "User activated successfully" })
    }

    if (action === "complete_wallet_funding") {
      const transactionId = String(body?.transactionId || "")
      if (!transactionId) {
        return NextResponse.json({ success: false, message: "Missing transaction details" }, { status: 400 })
      }

      const txRef = dbAdmin.collection("advertiserTransactions").doc(transactionId)
      const txSnap = await txRef.get()
      if (!txSnap.exists) {
        return NextResponse.json({ success: false, message: "Pending wallet funding record not found" }, { status: 404 })
      }

      const tx = txSnap.data() || {}
      if (tx.type !== "wallet_funding") {
        return NextResponse.json({ success: false, message: "This record is not a wallet funding transaction" }, { status: 400 })
      }

      const verificationCache = new Map<string, Promise<VerificationState>>()
      const successfulWebhookReferences = await buildSuccessfulWebhookReferences(dbAdmin)
      const txReferences = normalizeReferences([
        tx.reference,
        ...(Array.isArray(tx.referenceCandidates) ? tx.referenceCandidates : []),
      ])
      const verificationState = await resolveRecoveryVerificationState(
        txReferences,
        tx.provider || "monnify",
        verificationCache,
        successfulWebhookReferences,
        {
          email: String((await dbAdmin.collection("advertisers").doc(String(tx.userId || "")).get()).data()?.email || ""),
          amount: Number(tx.amount || 0),
          notBefore: serializeDate(tx.createdAt) as string | null,
        }
      )

      if (verificationState !== "paid") {
        return NextResponse.json(
          { success: false, message: verificationState === "manual_check" ? "Wallet funding payment is still pending and needs manual check" : "Wallet funding payment has not been verified as successful" },
          { status: 400 }
        )
      }

      await processWalletFundingWithRetry(
        String(tx.userId || ""),
        txReferences[0] || String(tx.reference || ""),
        Number(tx.amount || 0),
        String(tx.provider || "monnify"),
        "advertiser",
        3,
        txReferences
      )

      await dbAdmin.collection("adminNotifications").add({
        type: "wallet_funding_recovered",
        title: "Wallet funding recovered",
        body: `Recovered wallet funding of ₦${Number(tx.amount || 0).toLocaleString()} for ${String(tx.userId || "advertiser")}`,
        link: "/admin/recovery",
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        actor: adminSession.email,
        userId: String(tx.userId || ""),
        amount: Number(tx.amount || 0),
      })

      return NextResponse.json({ success: true, message: "Wallet funded successfully" })
    }

    return NextResponse.json({ success: false, message: "Unknown recovery action" }, { status: 400 })
  } catch (error) {
    console.error("[admin][recovery] action failed", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Recovery action failed" },
      { status: 500 }
    )
  }
}
