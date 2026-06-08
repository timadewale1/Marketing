import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/admin-session"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { processWalletFundingWithRetry, runFullActivationFlow } from "@/lib/paymentProcessing"
import { verifyTransaction as verifyMonnifyTransaction } from "@/services/monnify"

type PaymentScope = "activation" | "wallet_funding" | "campaign_payment" | "recovery"

function serializeDate(value: unknown) {
  if (value && typeof value === "object" && "toDate" in (value as Record<string, unknown>)) {
    return ((value as { toDate: () => Date }).toDate()).toISOString()
  }
  if (value instanceof Date) return value.toISOString()
  return value ? String(value) : null
}

function normalizeText(value: unknown) {
  return String(value || "").trim().toLowerCase()
}

function toMillis(value: unknown) {
  if (value && typeof value === "object" && "toDate" in (value as Record<string, unknown>)) {
    return ((value as { toDate: () => Date }).toDate()).getTime()
  }
  if (value instanceof Date) return value.getTime()
  const parsed = Date.parse(String(value || ""))
  return Number.isNaN(parsed) ? 0 : parsed
}

function isFulfilled(scope: PaymentScope, status: string) {
  const normalized = status.toLowerCase()
  if (scope === "activation") {
    return ["completed", "matched", "webhook_processed", "webhook_received"].includes(normalized)
  }
  if (scope === "wallet_funding") {
    return ["completed", "webhook_processed", "webhook_received"].includes(normalized)
  }
  return ["completed", "webhook_processed"].includes(normalized)
}

async function verifyReferencePaid(reference: string) {
  if (!reference) return false
  try {
    const payload = await verifyMonnifyTransaction(reference)
    if (!payload?.requestSuccessful) return false
    const responseBody = (payload as Record<string, unknown>).responseBody as Record<string, unknown> | undefined
    const status = normalizeText(responseBody?.paymentStatus || responseBody?.status)
    return ["paid", "success", "successful", "completed"].includes(status)
  } catch (error) {
    console.warn("[admin][payments] Monnify verification failed", { reference, error })
    return false
  }
}

export async function GET(req: Request) {
  const adminSession = await requireAdminSession()
  if ("errorResponse" in adminSession) {
    return adminSession.errorResponse as Response
  }

  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin || !admin) {
    return NextResponse.json({ success: false, message: "Firebase not initialized" }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") || 20)))
  const cursorCreatedAt = searchParams.get("cursorCreatedAt")
  const cursorId = searchParams.get("cursorId")
  const scope = normalizeText(searchParams.get("scope")) as PaymentScope | "all"
  const statusFilter = normalizeText(searchParams.get("status")) || "all"
  const search = normalizeText(searchParams.get("search"))

  try {
    const baseRef = dbAdmin.collection("paymentReconciliationLogs")
    const actionQuery = baseRef.orderBy("createdAt", "desc")

    const buildPayload = (docs: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]) => {
      const items = docs.map((doc) => {
        const data = doc.data()
        const rowScope = String(data.scope || "recovery") as PaymentScope
        const rowStatus = String(data.status || "")
        const rowAmount = Number(data.amount || 0)
        const fulfilled = isFulfilled(rowScope, rowStatus)
        return {
          id: doc.id,
          scope: rowScope,
          status: rowStatus,
          source: String(data.source || ""),
          provider: String(data.provider || ""),
          role: String(data.role || ""),
          userId: String(data.userId || ""),
          email: String(data.email || ""),
          reference: String(data.reference || ""),
          references: Array.isArray(data.references) ? data.references.map(String).filter(Boolean) : [],
          amount: rowAmount,
          transactionId: String(data.transactionId || ""),
          createdAt: serializeDate(data.createdAt),
          createdAtMs: toMillis(data.createdAt),
          fulfilled,
          details: data.details || {},
        }
      })

      return items.sort((a, b) => b.createdAtMs - a.createdAtMs)
    }

    if (search) {
      const targetedQueries: Promise<FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>>[] = []
      if (search.includes("@")) {
        targetedQueries.push(baseRef.where("email", "==", search).limit(pageSize).get())
      } else {
        targetedQueries.push(baseRef.where("userId", "==", search).limit(pageSize).get())
        targetedQueries.push(baseRef.where("reference", "==", search).limit(pageSize).get())
      }

      const snapshots = await Promise.all(targetedQueries)
      const mergedDocs = snapshots.flatMap((snap) => snap.docs)
      const uniqueDocs = Array.from(new Map(mergedDocs.map((doc) => [doc.id, doc])).values())
      const filteredDocs = uniqueDocs.filter((doc) => {
        const data = doc.data()
        const rowScope = String(data.scope || "recovery").toLowerCase()
        const rowStatus = String(data.status || "").toLowerCase()
        if (scope !== "all" && rowScope !== scope) return false
        if (statusFilter !== "all" && rowStatus !== statusFilter) return false
        return true
      })

      return NextResponse.json({
        success: true,
        items: buildPayload(filteredDocs).slice(0, pageSize),
        pageInfo: {
          hasMore: false,
          cursorCreatedAt: null,
          cursorId: null,
        },
        search,
        total: filteredDocs.length,
      })
    }

    let pagedQuery = actionQuery
    if (scope !== "all") {
      pagedQuery = pagedQuery.where("scope", "==", scope)
    }
    if (statusFilter !== "all") {
      pagedQuery = pagedQuery.where("status", "==", statusFilter)
    }
    pagedQuery = pagedQuery.orderBy(admin.firestore.FieldPath.documentId(), "desc")

    if (cursorCreatedAt && cursorId) {
      pagedQuery = pagedQuery.startAfter(new Date(cursorCreatedAt), cursorId)
    }

    const snap = await pagedQuery.limit(pageSize + 1).get()
    const pageDocs = snap.docs.slice(0, pageSize)
    const hasMore = snap.docs.length > pageSize
    const lastDoc = pageDocs[pageDocs.length - 1]

    return NextResponse.json({
      success: true,
      items: buildPayload(pageDocs),
      pageInfo: {
        hasMore,
        cursorCreatedAt: lastDoc ? serializeDate(lastDoc.data().createdAt) : null,
        cursorId: lastDoc?.id || null,
      },
      total: pageDocs.length,
    })
  } catch (error) {
    console.error("[admin][payments] failed to load payment queue", error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to load payment queue",
      },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  const adminSession = await requireAdminSession()
  if ("errorResponse" in adminSession) {
    return adminSession.errorResponse as Response
  }

  try {
    const body = await req.json().catch(() => ({}))
    const logId = String(body?.logId || "").trim()
    if (!logId) {
      return NextResponse.json({ success: false, message: "Missing payment log id" }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: "Firebase not initialized" }, { status: 500 })
    }

    const logRef = dbAdmin.collection("paymentReconciliationLogs").doc(logId)
    const logSnap = await logRef.get()
    if (!logSnap.exists) {
      return NextResponse.json({ success: false, message: "Payment log not found" }, { status: 404 })
    }

    const log = logSnap.data() || {}
    const scope = String(log.scope || "")
    const provider = String(log.provider || "monnify").toLowerCase()
    const userId = String(log.userId || "").trim()
    const reference = String(log.reference || "").trim()
    const references = Array.isArray(log.references) ? log.references.map((value: unknown) => String(value).trim()).filter(Boolean) : [reference]
    const amount = Number(log.amount || 0)
    const role = String(log.role || "")
    const email = String(log.email || "").trim()

    if (!userId || !reference) {
      return NextResponse.json({ success: false, message: "Payment log is missing user or reference details" }, { status: 400 })
    }

    const paid = provider === "monnify" ? await verifyReferencePaid(reference) : true
    if (!paid) {
      return NextResponse.json({ success: false, message: "This payment is not yet confirmed as paid" }, { status: 400 })
    }

    if (scope === "activation") {
      const targetRole = role === "advertiser" ? "advertiser" : "earner"
      await runFullActivationFlow(
        userId,
        reference,
        provider,
        targetRole,
        references,
        amount || 2000
      )

      await logRef.set({
        status: "completed",
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        resolvedBy: adminSession.email,
      }, { merge: true })

      await dbAdmin.collection("adminNotifications").add({
        type: "payment_resolved",
        title: "Activation payment resolved",
        body: `${email || userId} activation has been completed.`,
        link: targetRole === "advertiser" ? `/admin/advertisers/${userId}` : `/admin/earners/${userId}`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        actor: adminSession.email,
        userId,
        amount,
      })

      return NextResponse.json({ success: true, message: "Activation completed" })
    }

    if (scope === "wallet_funding") {
      const txCollection = role === "earner" ? "earnerTransactions" : "advertiserTransactions"
      const userCollection = role === "earner" ? "earners" : "advertisers"
      const txQuery = await dbAdmin.collection(txCollection)
        .where("userId", "==", userId)
        .where("type", "==", "wallet_funding")
        .where("status", "==", "pending")
        .limit(20)
        .get()

      const matchingTx = txQuery.docs.find((doc) => {
        const data = doc.data()
        const docRefs = [data.reference, ...(Array.isArray(data.referenceCandidates) ? data.referenceCandidates : [])].map((value) => String(value || "").trim()).filter(Boolean)
        return references.some((item) => docRefs.includes(item))
      })

      if (!matchingTx) {
        return NextResponse.json({ success: false, message: "No matching wallet funding record found" }, { status: 404 })
      }

      await processWalletFundingWithRetry(
        userId,
        reference,
        amount,
        provider,
        role === "earner" ? "earner" : "advertiser",
        3,
        references
      )

      await logRef.set({
        status: "completed",
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        resolvedBy: adminSession.email,
      }, { merge: true })

      await dbAdmin.collection("adminNotifications").add({
        type: "payment_resolved",
        title: "Wallet funding resolved",
        body: `${email || userId} wallet funding of ₦${amount.toLocaleString()} has been credited.`,
        link: role === "advertiser" ? `/admin/advertisers/${userId}` : `/admin/earners/${userId}`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        actor: adminSession.email,
        userId,
        amount,
      })

      return NextResponse.json({ success: true, message: "Wallet funding credited" })
    }

    return NextResponse.json({ success: false, message: "This payment type does not need manual resolution" }, { status: 400 })
  } catch (error) {
    console.error("[admin][payments] resolve failed", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to resolve payment" },
      { status: 500 }
    )
  }
}
