import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/admin-session"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { processWalletFundingWithRetry, runFullActivationFlow } from "@/lib/paymentProcessing"
import { findSuccessfulTransactionMatch, verifyTransaction as verifyMonnifyTransaction } from "@/services/monnify"

type UserRole = "earner" | "advertiser"
type PaymentProvider = "monnify" | "paystack"

type ProcessedWebhookRecord = {
  reference?: unknown
  referenceCandidates?: unknown
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

async function verifyProviderPayment(reference: string, provider: PaymentProvider) {
  if (!reference) return false

  if (provider === "paystack") {
    return verifyPaystackPayment(reference)
  }

  try {
    const payload = await verifyMonnifyTransaction(reference)
    const responseBody = payload?.responseBody as { paymentStatus?: string } | undefined
    const paymentStatus = String(responseBody?.paymentStatus || "").toUpperCase()
    return Boolean(payload?.requestSuccessful && (paymentStatus === "PAID" || paymentStatus === "SUCCESSFUL"))
  } catch (error) {
    console.warn("[admin][recovery] failed to verify monnify payment", { reference, error })
    return false
  }
}

async function verifyMonnifyPaymentContext(
  references: string[],
  email: string | null | undefined,
  amount: number | null | undefined,
  notBefore: string | null | undefined
) {
  try {
    const transaction = await findSuccessfulTransactionMatch({
      references,
      email,
      amount,
      notBefore,
    })
    return Boolean(transaction)
  } catch (error) {
    console.warn("[admin][recovery] failed contextual monnify verification", {
      references,
      email,
      amount,
      notBefore,
      error,
    })
    return false
  }
}

async function hasVerifiedSuccessfulPayment(
  references: string[],
  providerHint: unknown,
  verificationCache: Map<string, Promise<boolean>>,
  successfulWebhookReferences?: Set<string>,
  context?: {
    email?: string | null
    amount?: number | null
    notBefore?: string | null
  }
) {
  const uniqueReferences = [...new Set(references.map((value) => String(value || "").trim()).filter(Boolean))]
  if (uniqueReferences.length === 0) return false

  if (successfulWebhookReferences) {
    for (const reference of uniqueReferences) {
      if (successfulWebhookReferences.has(reference)) {
        return true
      }
    }
  }

  const hintedProvider = normalizeProvider(providerHint)
  const providersToTry: PaymentProvider[] = hintedProvider
    ? hintedProvider === "monnify"
      ? ["monnify", "paystack"]
      : ["paystack", "monnify"]
    : ["monnify", "paystack"]

  for (const reference of uniqueReferences) {
    for (const provider of providersToTry) {
      const cacheKey = `${provider}:${reference}`
      let verification = verificationCache.get(cacheKey)
      if (!verification) {
        verification = verifyProviderPayment(reference, provider)
        verificationCache.set(cacheKey, verification)
      }

      if (await verification) {
        return true
      }
    }
  }

  if (providersToTry.includes("monnify") && context?.email && context?.amount != null) {
    const cacheKey = `monnify-context:${uniqueReferences.join("|")}:${context.email}:${context.amount}:${context.notBefore || ""}`
    let verification = verificationCache.get(cacheKey)
    if (!verification) {
      verification = verifyMonnifyPaymentContext(
        uniqueReferences,
        context.email,
        context.amount,
        context.notBefore || null
      )
      verificationCache.set(cacheKey, verification)
    }

    if (await verification) {
      return true
    }
  }

  return false
}

export async function GET() {
  await requireAdminSession()
  const { dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin) {
    return NextResponse.json({ success: false, message: "Firebase not initialized" }, { status: 500 })
  }

  const [earnersSnap, advertisersSnap, earnerActivationTxSnap, advertiserActivationTxSnap, pendingWalletSnap, processedWebhookSnap] = await Promise.all([
    dbAdmin.collection("earners").get(),
    dbAdmin.collection("advertisers").get(),
    dbAdmin.collection("earnerTransactions").where("type", "==", "activation_fee").where("status", "==", "completed").get(),
    dbAdmin.collection("advertiserTransactions").where("type", "==", "activation_fee").where("status", "==", "completed").get(),
    dbAdmin.collection("advertiserTransactions").where("type", "==", "wallet_funding").where("status", "==", "pending").get(),
    dbAdmin.collection("processedWebhooks").where("eventType", "==", "TRANSACTION_COMPLETION").get(),
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

  const verificationCache = new Map<string, Promise<boolean>>()
  const successfulWebhookReferences = new Set(
    processedWebhookSnap.docs
      .filter((doc) => {
        const status = String(doc.data().status || "").toUpperCase()
        return status === "SUCCESS" || status === "SUCCESSFUL"
      })
      .flatMap((doc) => getProcessedWebhookReferences(doc.data()))
  )

  const activationCandidateDrafts = [
    ...earnersSnap.docs.map((doc) => ({ doc, role: "earner" as const })),
    ...advertisersSnap.docs.map((doc) => ({ doc, role: "advertiser" as const })),
  ]
    .map(({ doc, role }) => {
      const data = doc.data()
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
        ...(txInfo?.reference ? [txInfo.reference] : []),
      ])]

      return {
        id: doc.id,
        role,
        name: String(data.fullName || data.businessName || data.name || data.companyName || "Unnamed user"),
        email: String(data.email || ""),
        activated: Boolean(data.activated),
        pendingActivationReference: data.pendingActivationReference ? String(data.pendingActivationReference) : null,
        activationReference: data.activationReference ? String(data.activationReference) : null,
        activationAttemptedAt: serializeDate(data.activationAttemptedAt) as string | null,
        activatedAt: serializeDate(data.activatedAt) as string | null,
        providerHint: data.pendingActivationProvider || data.activationPaymentProvider || null,
        references,
        lastActivationTxAt: txInfo?.createdAt || null,
        hasCompletedActivationTx: Boolean(txInfo?.reference),
      }
    })
    .filter((candidate) => !candidate.activated && candidate.references.length > 0)

  const activationCandidates = (await Promise.all(
    activationCandidateDrafts.map(async (candidate) => {
      if (candidate.hasCompletedActivationTx) return candidate

      const isVerified = await hasVerifiedSuccessfulPayment(
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

      return isVerified ? candidate : null
    })
  ))
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => (b.activationAttemptedAt || b.lastActivationTxAt || "").localeCompare(a.activationAttemptedAt || a.lastActivationTxAt || ""))

  const walletCandidates = await Promise.all(
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
      const isVerified = await hasVerifiedSuccessfulPayment(
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
      if (!isVerified) return null

      return {
        id: txDoc.id,
        userId: advertiserId,
        name: String(advertiser?.name || advertiser?.businessName || advertiser?.companyName || "Unnamed advertiser"),
        email: String(advertiser?.email || ""),
        amount: Number(data.amount || 0),
        reference,
        provider,
        status: String(data.status || "pending"),
        createdAt: serializeDate(data.createdAt) as string | null,
        currentBalance: Number(advertiser?.balance || 0),
      }
    })
  )

  return NextResponse.json({
    success: true,
    activationCandidates,
    walletCandidates: walletCandidates
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
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
      const references = [...new Set([
        ...(data.pendingActivationReference ? [String(data.pendingActivationReference)] : []),
        ...((Array.isArray(data.pendingActivationReferences) ? data.pendingActivationReferences : []).map((value: unknown) => String(value))),
        ...(data.activationReference ? [String(data.activationReference)] : []),
        ...((Array.isArray(data.activationReferences) ? data.activationReferences : []).map((value: unknown) => String(value))),
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
        const verificationCache = new Map<string, Promise<boolean>>()
        const processedWebhookSnap = await dbAdmin
          .collection("processedWebhooks")
          .where("eventType", "==", "TRANSACTION_COMPLETION")
          .get()
        const successfulWebhookReferences = new Set(
          processedWebhookSnap.docs
            .filter((doc) => {
              const status = String(doc.data().status || "").toUpperCase()
              return status === "SUCCESS" || status === "SUCCESSFUL"
            })
            .flatMap((doc) => getProcessedWebhookReferences(doc.data()))
        )
        const paymentVerified = await hasVerifiedSuccessfulPayment(
          references,
          data.pendingActivationProvider || data.activationPaymentProvider || null,
          verificationCache,
          successfulWebhookReferences,
          {
            email: String(data.email || ""),
            amount: 2000,
            notBefore: serializeDate(data.activationAttemptedAt) as string | null,
          }
        )

        if (!paymentVerified) {
          return NextResponse.json(
            { success: false, message: "Activation payment has not been verified as successful for this user" },
            { status: 400 }
          )
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

      const verificationCache = new Map<string, Promise<boolean>>()
      const processedWebhookSnap = await dbAdmin
        .collection("processedWebhooks")
        .where("eventType", "==", "TRANSACTION_COMPLETION")
        .get()
      const successfulWebhookReferences = new Set(
        processedWebhookSnap.docs
          .filter((doc) => {
            const status = String(doc.data().status || "").toUpperCase()
            return status === "SUCCESS" || status === "SUCCESSFUL"
          })
          .flatMap((doc) => getProcessedWebhookReferences(doc.data()))
      )
      const txReferences = normalizeReferences([
        tx.reference,
        ...(Array.isArray(tx.referenceCandidates) ? tx.referenceCandidates : []),
      ])
      const paymentVerified = await hasVerifiedSuccessfulPayment(
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

      if (!paymentVerified) {
        return NextResponse.json(
          { success: false, message: "Wallet funding payment has not been verified as successful" },
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
