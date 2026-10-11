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

    const earnerRef = db.collection("earners").doc(verifiedUid)
    const refundRef = db.collection("earnerTransactions").doc(`withdrawal-refund-${withdrawalId}`)
    const txQuery = db
      .collection("earnerTransactions")
      .where("withdrawalId", "==", withdrawalId)
      .where("type", "==", "withdrawal_request")

    await db.runTransaction(async (transaction) => {
      const [currentWithdrawalSnap, earnerSnap, txSnap, refundSnap] = await Promise.all([
        transaction.get(withdrawalRef),
        transaction.get(earnerRef),
        transaction.get(txQuery),
        transaction.get(refundRef),
      ])

      if (!currentWithdrawalSnap.exists || !earnerSnap.exists) {
        throw new Error("Withdrawal request or earner account not found")
      }

      const currentWithdrawal = currentWithdrawalSnap.data() || {}
      const status = String(currentWithdrawal.status || "").toLowerCase()
      const payoutStatus = String(currentWithdrawal.payoutStatus || "").toLowerCase()
      const statusAllowsCancellation = ["pending", "pending_admin_approval", "processing"].includes(status)
      const payoutIsSafelyRetryable = payoutStatus === "failed_retryable"
      const payoutHasMonnifyEvidence = Boolean(
        currentWithdrawal.payoutMonnifyResponseReceivedAt || currentWithdrawal.monnifyReference,
      )
      const payoutCanBeCancelled =
        (!payoutStatus || payoutIsSafelyRetryable) &&
        !payoutHasMonnifyEvidence &&
        (!currentWithdrawal.payoutStartedAt || payoutIsSafelyRetryable)

      if (!statusAllowsCancellation || !payoutCanBeCancelled) {
        throw new Error("Withdrawal cannot be cancelled after payout processing has started")
      }

      const amount = Number(currentWithdrawal.amount || 0)
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Withdrawal amount is invalid")
      }

      const balanceWasDebited = Boolean(currentWithdrawal.payoutBalanceDebited || currentWithdrawal.payoutStartedAt)
      const shouldRefundBalance = balanceWasDebited && !refundSnap.exists

      if (shouldRefundBalance) {
        transaction.update(earnerRef, {
          balance: admin.firestore.FieldValue.increment(amount),
        })
        transaction.set(refundRef, {
          userId: verifiedUid,
          withdrawalId,
          type: "withdrawal_refund",
          amount,
          status: "completed",
          note: "Withdrawal cancelled; debited funds returned to wallet",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      }

      transaction.update(withdrawalRef, {
        status: "cancelled",
        approvalStatus: "cancelled",
        cancelledBy: "user",
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(balanceWasDebited ? { walletRefundedAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
      })

      txSnap.docs.forEach((txDoc) => {
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
