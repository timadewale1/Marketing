import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/admin-session"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

type PaymentScope = "activation" | "wallet_funding" | "campaign_payment" | "recovery"

function serializeDate(value: unknown) {
  if (value && typeof value === "object" && "toDate" in (value as Record<string, unknown>)) {
    return ((value as { toDate: () => Date }).toDate()).toISOString()
  }
  if (value instanceof Date) return value.toISOString()
  return value ? String(value) : null
}

function toMillis(value: unknown) {
  if (value && typeof value === "object" && "toDate" in (value as Record<string, unknown>)) {
    return ((value as { toDate: () => Date }).toDate()).getTime()
  }
  if (value instanceof Date) return value.getTime()
  const parsed = Date.parse(String(value || ""))
  return Number.isNaN(parsed) ? 0 : parsed
}

function normalizeText(value: unknown) {
  return String(value || "").trim().toLowerCase()
}

async function getUserDetails(dbAdmin: FirebaseFirestore.Firestore, role: string, userId: string) {
  if (!userId) return { name: "Unknown user", email: "" }
  const collectionName = role === "advertiser" ? "advertisers" : role === "vendor" ? "vendors" : "earners"
  const snap = await dbAdmin.collection(collectionName).doc(userId).get()
  if (!snap.exists) return { name: userId, email: "" }
  const data = snap.data() || {}
  return {
    name: String(data.fullName || data.name || data.businessName || data.companyName || data.email || userId).trim(),
    email: String(data.email || "").trim().toLowerCase(),
  }
}

function buildLifecyclePayload(data: FirebaseFirestore.DocumentData) {
  const lifecycle = data.lifecycle || {}
  return {
    paymentReference: String(data.paymentReference || lifecycle.paymentReference || data.reference || ""),
    monnifyTransactionReference: String(data.monnifyTransactionReference || lifecycle.monnifyTransactionReference || ""),
    webhookReceivedAt: serializeDate(data.webhookReceivedAt || lifecycle.webhookReceivedAt || null),
    monnifyVerificationResult: String(data.monnifyVerificationResult || lifecycle.monnifyVerificationResult || ""),
    processorAttemptCount: Number(data.processorAttemptCount ?? lifecycle.processorAttemptCount ?? 0),
    lastError: String(data.lastError || lifecycle.lastError || ""),
    lastProcessingAttempt: serializeDate(data.lastProcessingAttempt || lifecycle.lastProcessingAttempt || null),
    finalStatus: String(data.finalStatus || lifecycle.finalStatus || data.status || ""),
    paymentType: String(data.paymentType || lifecycle.paymentType || data.scope || ""),
    timestamps: lifecycle.timestamps || data.timestamps || {},
  }
}

export async function GET(req: Request) {
  const adminSession = await requireAdminSession()
  if ("errorResponse" in adminSession) {
    return adminSession.errorResponse as Response
  }

  const { dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin) {
    return NextResponse.json({ success: false, message: "Firebase not initialized" }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") || 15)))
  const cursorCreatedAt = searchParams.get("cursorCreatedAt")
  const scope = normalizeText(searchParams.get("scope")) as PaymentScope | "all"
  const statusFilter = normalizeText(searchParams.get("status")) || "all"
  const search = normalizeText(searchParams.get("search"))

  try {
    const baseRef = dbAdmin.collection("paymentReconciliationLogs")

    if (search) {
      const queries: Promise<FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>>[] = []
      if (search.includes("@")) {
        queries.push(baseRef.where("email", "==", search).limit(pageSize).get())
      } else {
        queries.push(baseRef.where("userId", "==", search).limit(pageSize).get())
        queries.push(baseRef.where("reference", "==", search).limit(pageSize).get())
        queries.push(baseRef.where("paymentReference", "==", search).limit(pageSize).get())
        queries.push(baseRef.where("monnifyTransactionReference", "==", search).limit(pageSize).get())
      }

      const snapshots = await Promise.all(queries)
      const merged = snapshots.flatMap((snap) => snap.docs)
      const uniqueDocs = Array.from(new Map(merged.map((doc) => [doc.id, doc])).values())
      const filtered = uniqueDocs.filter((doc) => {
        const data = doc.data()
        const rowScope = String(data.scope || "recovery").toLowerCase()
        const rowStatus = String(data.status || "").toLowerCase()
        const rowFinalStatus = String(data.finalStatus || data.lifecycle?.finalStatus || "").toLowerCase()
        if (scope !== "all" && rowScope !== scope) return false
        if (statusFilter !== "all" && rowStatus !== statusFilter && rowFinalStatus !== statusFilter) return false
        return true
      })

      filtered.sort((a, b) => {
        const aTime = toMillis(a.data().createdAt)
        const bTime = toMillis(b.data().createdAt)
        if (bTime !== aTime) return bTime - aTime
        return b.id.localeCompare(a.id)
      })

      const items = await Promise.all(
        filtered.slice(0, pageSize).map(async (doc) => {
          const data = doc.data()
          const role = String(data.role || "")
          const userId = String(data.userId || "")
          const user = await getUserDetails(dbAdmin, role, userId)
          return {
            id: doc.id,
            scope: String(data.scope || "recovery") as PaymentScope,
            status: String(data.status || ""),
            source: String(data.source || ""),
            provider: String(data.provider || ""),
            role,
            userId,
            name: user.name,
            email: user.email || String(data.email || ""),
            reference: String(data.reference || ""),
            paymentReference: String(data.paymentReference || data.reference || ""),
            references: Array.isArray(data.references) ? data.references.map((value: unknown) => String(value).trim()).filter(Boolean) : [],
            amount: Number(data.amount || 0),
            transactionId: String(data.transactionId || ""),
            createdAt: serializeDate(data.createdAt),
            createdAtMs: toMillis(data.createdAt),
            lifecycle: buildLifecyclePayload(data),
            details: data.details || {},
          }
        })
      )

      return NextResponse.json({
        success: true,
        items,
        pageInfo: { hasMore: false, cursorCreatedAt: null, cursorId: null },
        search,
        total: filtered.length,
      })
    }

    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = baseRef.orderBy("createdAt", "desc")
    if (scope !== "all") query = query.where("scope", "==", scope)
    if (statusFilter !== "all") query = query.where("status", "==", statusFilter)
    if (cursorCreatedAt) {
      query = query.startAfter(new Date(cursorCreatedAt))
    }

    const snap = await query.limit(pageSize + 1).get()
    const hasMore = snap.docs.length > pageSize
    const docs = snap.docs.slice(0, pageSize)
    const lastDoc = docs[docs.length - 1] || null

    const items = await Promise.all(
      docs.map(async (doc) => {
        const data = doc.data()
        const role = String(data.role || "")
        const userId = String(data.userId || "")
        const user = await getUserDetails(dbAdmin, role, userId)
        return {
          id: doc.id,
          scope: String(data.scope || "recovery") as PaymentScope,
          status: String(data.status || ""),
          source: String(data.source || ""),
          provider: String(data.provider || ""),
          role,
          userId,
          name: user.name,
          email: user.email || String(data.email || ""),
          reference: String(data.reference || ""),
          paymentReference: String(data.paymentReference || data.reference || ""),
          references: Array.isArray(data.references) ? data.references.map((value: unknown) => String(value).trim()).filter(Boolean) : [],
          amount: Number(data.amount || 0),
          transactionId: String(data.transactionId || ""),
          createdAt: serializeDate(data.createdAt),
          createdAtMs: toMillis(data.createdAt),
          lifecycle: buildLifecyclePayload(data),
          details: data.details || {},
        }
      })
    )

    items.sort((a, b) => b.createdAtMs - a.createdAtMs)

    return NextResponse.json({
      success: true,
      items,
      pageInfo: {
        hasMore,
        cursorCreatedAt: lastDoc ? serializeDate(lastDoc.data().createdAt) : null,
        cursorId: lastDoc?.id || null,
      },
      total: items.length,
    })
  } catch (error) {
    console.error("[admin][payment-lifecycle] failed to load lifecycle logs", error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to load payment lifecycle logs",
      },
      { status: 500 }
    )
  }
}
