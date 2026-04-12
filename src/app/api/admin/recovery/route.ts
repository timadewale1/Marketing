import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/admin-session"
import { getActivationAttemptDocId } from "@/lib/activation-attempts"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { processWalletFundingWithRetry, runFullActivationFlow } from "@/lib/paymentProcessing"

type UserRole = "earner" | "advertiser"
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

async function buildSuccessfulWebhookReferences(dbAdmin: FirebaseFirestore.Firestore) {
  const processedWebhookSnap = await dbAdmin
    .collection("processedWebhooks")
    .where("eventType", "==", "TRANSACTION_COMPLETION")
    .limit(1000)
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

function resolveLightVerificationState(
  references: string[],
  providerHint: unknown,
  successfulWebhookReferences: Set<string>,
): VerificationState {
  if (references.some((reference) => successfulWebhookReferences.has(reference))) {
    return "paid"
  }

  if (providerHint) {
    return "manual_check"
  }

  const hasMonnifyLike = references.some((reference) => {
    const normalized = reference.toUpperCase()
    return normalized.startsWith("MNFY|") || normalized.startsWith("TX_") || normalized.startsWith("MNFY")
  })

  return hasMonnifyLike ? "manual_check" : "unverified"
}

export async function GET(): Promise<Response> {
  const adminSession = await requireAdminSession()
  if ("errorResponse" in adminSession) {
    return adminSession.errorResponse as Response
  }

  const { dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin) {
    return NextResponse.json({ success: false, message: "Firebase not initialized" }, { status: 500 })
  }

  const [pendingWalletSnap, activationAttemptsSnap, successfulWebhookReferences] = await Promise.all([
    dbAdmin.collection("advertiserTransactions").where("type", "==", "wallet_funding").where("status", "==", "pending").get(),
    dbAdmin.collection("activationAttempts").get(),
    buildSuccessfulWebhookReferences(dbAdmin),
  ])

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

  const activationCandidates: Array<{
    id: string
    role: UserRole
    name: string
    email: string
    activated: boolean
    pendingActivationReference: string | null
    activationReference: string | null
    activationAttemptedAt: string | null
    activatedAt: string | null
    references: string[]
    lastActivationTxAt: string | null
    paymentVerified: boolean
    verificationState: VerificationState
  }> = []

  const earnerIds = new Set<string>()
  const advertiserIds = new Set<string>()
  for (const key of activationAttemptsByUser.keys()) {
    const [role, userId] = key.split(":")
    if (role === "earner") earnerIds.add(userId)
    if (role === "advertiser") advertiserIds.add(userId)
  }

  const fetchUsers = async (role: UserRole, ids: string[]) => {
    if (ids.length === 0) return []
    const refs = ids.map((id) => dbAdmin.collection(role === "earner" ? "earners" : "advertisers").doc(id))
    const snaps = await dbAdmin.getAll(...refs)
    return snaps.map((snap) => ({ snap, role }))
  }

  const [earnerDocs, advertiserDocs] = await Promise.all([
    fetchUsers("earner", Array.from(earnerIds)),
    fetchUsers("advertiser", Array.from(advertiserIds)),
  ])

  for (const { snap, role } of [...earnerDocs, ...advertiserDocs]) {
    if (!snap.exists) continue
    const data = snap.data() || {}
    const attemptInfo = activationAttemptsByUser.get(`${role}:${snap.id}`)
    const pendingReferences = Array.isArray(data.pendingActivationReferences)
      ? data.pendingActivationReferences.map((value: unknown) => String(value)).filter(Boolean)
      : []
    const references = normalizeReferences([
      ...(data.pendingActivationReference ? [String(data.pendingActivationReference)] : []),
      ...pendingReferences,
      ...(attemptInfo?.references || []),
    ])

    if (references.length === 0 || Boolean(data.activated)) continue

    const providerHint = data.pendingActivationProvider || data.activationPaymentProvider || attemptInfo?.providerHint || null
    const verificationState = resolveLightVerificationState(references, providerHint, successfulWebhookReferences)

    activationCandidates.push({
      id: snap.id,
      role,
      name: String(data.fullName || data.businessName || data.name || data.companyName || attemptInfo?.name || "Unnamed user"),
      email: String(data.email || attemptInfo?.email || "").trim().toLowerCase(),
      activated: Boolean(data.activated),
      pendingActivationReference: data.pendingActivationReference ? String(data.pendingActivationReference) : null,
      activationReference: data.activationReference ? String(data.activationReference) : null,
      activationAttemptedAt: (serializeDate(data.activationAttemptedAt) as string | null) || attemptInfo?.activationAttemptedAt || null,
      activatedAt: serializeDate(data.activatedAt) as string | null,
      references,
      lastActivationTxAt: null,
      paymentVerified: verificationState === "paid",
      verificationState,
    })
  }

  activationCandidates.sort((a, b) => {
    const verifiedSort = Number(b.paymentVerified) - Number(a.paymentVerified)
    if (verifiedSort !== 0) return verifiedSort
    return (b.activationAttemptedAt || b.lastActivationTxAt || "").localeCompare(a.activationAttemptedAt || a.lastActivationTxAt || "")
  })

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
      const verificationState = resolveLightVerificationState(
        txReferences,
        provider,
        successfulWebhookReferences,
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

  return NextResponse.json({
    success: true,
    activationCandidates,
    walletCandidates: walletCandidates.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    autoRecovered: {
      activations: 0,
      walletFunding: 0,
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
        const successfulWebhookReferences = await buildSuccessfulWebhookReferences(dbAdmin)
        const verificationState = resolveLightVerificationState(
          references,
          data.pendingActivationProvider || data.activationPaymentProvider || attemptData?.provider || null,
          successfulWebhookReferences,
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

      const successfulWebhookReferences = await buildSuccessfulWebhookReferences(dbAdmin)
      const txReferences = normalizeReferences([
        tx.reference,
        ...(Array.isArray(tx.referenceCandidates) ? tx.referenceCandidates : []),
      ])
      const verificationState = resolveLightVerificationState(
        txReferences,
        tx.provider || "monnify",
        successfulWebhookReferences,
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
