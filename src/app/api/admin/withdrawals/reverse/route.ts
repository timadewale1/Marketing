import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/admin-session"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

type WithdrawalSource = "earner" | "advertiser" | "vendor" | "customer"

export async function POST(req: Request) {
  const adminSession = await requireAdminSession()
  if ("errorResponse" in adminSession) {
    return adminSession.errorResponse as Response
  }

  try {
    const body = await req.json().catch(() => ({}))
    const withdrawalId = String(body?.withdrawalId || "").trim()
    const source = String(body?.source || "").trim() as WithdrawalSource

    if (!withdrawalId || !["earner", "advertiser", "vendor", "customer"].includes(source)) {
      return NextResponse.json({ success: false, message: "Missing withdrawal details" }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: "Firebase not initialized" }, { status: 500 })
    }

    const db = dbAdmin
    const withdrawalCollection =
      source === "advertiser"
        ? "advertiserWithdrawals"
        : source === "vendor"
          ? "vendorWithdrawals"
          : source === "customer"
            ? "customerWithdrawals"
            : "earnerWithdrawals"
    const txCollection =
      source === "advertiser"
        ? "advertiserTransactions"
        : source === "vendor"
          ? "vendorTransactions"
          : source === "customer"
            ? "customerTransactions"
            : "earnerTransactions"
    const userCollection =
      source === "advertiser"
        ? "advertisers"
        : source === "vendor"
          ? "vendors"
          : source === "customer"
            ? "customers"
            : "earners"

    const withdrawalRef = db.collection(withdrawalCollection).doc(withdrawalId)
    const withdrawalSnap = await withdrawalRef.get()
    if (!withdrawalSnap.exists) {
      return NextResponse.json({ success: false, message: "Withdrawal request not found" }, { status: 404 })
    }

    const withdrawal = withdrawalSnap.data() || {}
    const status = String(withdrawal.status || "").toLowerCase()
    if (["cancelled", "failed", "reversed"].includes(status)) {
      return NextResponse.json({ success: false, message: "Withdrawal is already cancelled or reversed" }, { status: 400 })
    }

    const userId = String(withdrawal.userId || "").trim()
    const amount = Number(withdrawal.amount || 0)
    if (!userId || amount <= 0) {
      return NextResponse.json({ success: false, message: "Withdrawal record is incomplete" }, { status: 400 })
    }

    const restoreBalance = status === "sent" || status === "completed"

    const userRef = db.collection(userCollection).doc(userId)
    const txQuery = await db
      .collection(txCollection)
      .where("withdrawalId", "==", withdrawalId)
      .where("type", "==", "withdrawal_request")
      .get()

    await db.runTransaction(async (transaction) => {
      if (restoreBalance) {
        const userSnap = await transaction.get(userRef)
        if (!userSnap.exists) {
          throw new Error("User not found")
        }

        transaction.update(userRef, {
          balance: admin.firestore.FieldValue.increment(amount),
          totalWithdrawn: admin.firestore.FieldValue.increment(-amount),
        })
      }

      transaction.update(withdrawalRef, {
        status: "cancelled",
        approvalStatus: "cancelled",
        cancelledBy: adminSession.email,
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      txQuery.docs.forEach((txDoc) => {
        transaction.update(txDoc.ref, {
          status: "cancelled",
          note: "Withdrawal request cancelled by admin",
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      })
    })

    return NextResponse.json({ success: true, message: "Withdrawal reversed and cancelled successfully" })
  } catch (error) {
    console.error("[admin][withdrawals][reverse] failed", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to reverse withdrawal" },
      { status: 500 }
    )
  }
}
