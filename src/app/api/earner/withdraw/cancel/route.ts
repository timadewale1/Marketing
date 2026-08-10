import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const withdrawalId = String(body?.withdrawalId || "").trim()
    if (!withdrawalId) {
      return NextResponse.json({ success: false, message: "Missing withdrawalId" }, { status: 400 })
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, message: "Missing Authorization token" }, { status: 401 })
    }
    const idToken = authHeader.split("Bearer ")[1]

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: "Server admin unavailable" }, { status: 500 })
    }
    const db = dbAdmin as import("firebase-admin").firestore.Firestore

    let verifiedUid: string
    try {
      const decoded = await admin.auth().verifyIdToken(idToken)
      verifiedUid = decoded.uid
    } catch (err) {
      console.error("Invalid ID token", err)
      return NextResponse.json({ success: false, message: "Invalid ID token" }, { status: 401 })
    }

    const withdrawalRef = db.collection("earnerWithdrawals").doc(withdrawalId)
    const withdrawalSnap = await withdrawalRef.get()
    if (!withdrawalSnap.exists) {
      return NextResponse.json({ success: false, message: "Withdrawal request not found" }, { status: 404 })
    }

    const withdrawal = withdrawalSnap.data() || {}
    const userId = String(withdrawal.userId || "").trim()
    if (userId !== verifiedUid) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 })
    }

    const status = String(withdrawal.status || "").toLowerCase()
    if (["completed", "sent", "failed", "cancelled", "reversed"].includes(status)) {
      return NextResponse.json({ success: false, message: "Withdrawal cannot be cancelled" }, { status: 400 })
    }

    const txQuery = await db
      .collection("earnerTransactions")
      .where("withdrawalId", "==", withdrawalId)
      .where("type", "==", "withdrawal_request")
      .get()

    await db.runTransaction(async (transaction) => {
      transaction.update(withdrawalRef, {
        status: "cancelled",
        approvalStatus: "cancelled",
        cancelledBy: "user",
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      txQuery.docs.forEach((txDoc) => {
        transaction.update(txDoc.ref, {
          status: "cancelled",
          note: "Withdrawal request cancelled by user",
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      })
    })

    return NextResponse.json({ success: true, message: "Withdrawal request cancelled successfully" })
  } catch (err) {
    console.error("[earner][withdraw][cancel] failed", err)
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : "Failed to cancel withdrawal" }, { status: 500 })
  }
}
