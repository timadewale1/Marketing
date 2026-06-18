import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { requireAdminSession } from "@/lib/admin-session"

function resolveUserCollection(data: Record<string, unknown>) {
  const raw = String(data.userCollection || data.role || data.userType || "").toLowerCase()
  if (raw === "advertiser" || raw === "advertisers") return "advertisers" as const
  return "earners" as const
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession()
    const { id } = await context.params
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const action = String(body.action || "").toLowerCase()
    const reason = String(body.reason || "").trim()

    if (!id || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: "Firebase admin unavailable" }, { status: 500 })
    }

    const claimRef = dbAdmin.collection("vendorPurchaseSubmissions").doc(id)
    const claimSnap = await claimRef.get()
    if (!claimSnap.exists) {
      return NextResponse.json({ success: false, message: "Submission not found" }, { status: 404 })
    }

    const claim = claimSnap.data() as Record<string, unknown>
    const userId = String(claim.userId || "")
    const cashbackAmount = Math.max(0, Number(claim.cashbackAmount || 0))
    const userCollection = resolveUserCollection(claim)
    const userRef = dbAdmin.collection(userCollection).doc(userId)
    const userSnap = await userRef.get()
    if (!userSnap.exists) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
    }

    if (action === "reject" && !reason) {
      return NextResponse.json({ success: false, message: "A rejection reason is required" }, { status: 400 })
    }

    const updates: Record<string, unknown> = {
      status: action === "approve" ? "approved" : "rejected",
      reviewerReason: action === "reject" ? reason : FieldValue.delete(),
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (action === "approve" && cashbackAmount > 0) {
      const txRef = dbAdmin.collection(userCollection === "advertisers" ? "advertiserTransactions" : "earnerTransactions").doc()
      await dbAdmin.runTransaction(async (transaction) => {
        transaction.update(userRef, {
          balance: FieldValue.increment(cashbackAmount),
          updatedAt: FieldValue.serverTimestamp(),
        })
        transaction.set(txRef, {
          userId,
          type: "vendor_cashback",
          amount: cashbackAmount,
          status: "completed",
          note: `Vendor cashback approved for ${String(claim.vendorName || "vendor")}`,
          reference: String(claim.productId || id),
          createdAt: FieldValue.serverTimestamp(),
          source: "vendor_cashback",
        })
        transaction.update(claimRef, updates)
      })
    } else {
      await claimRef.update(updates)
    }

    return NextResponse.json({ success: true, message: action === "approve" ? "Submission approved" : "Submission rejected" })
  } catch (error) {
    console.error("Admin vendor submission review error:", error)
    return NextResponse.json({ success: false, message: "Failed to review submission" }, { status: 500 })
  }
}
