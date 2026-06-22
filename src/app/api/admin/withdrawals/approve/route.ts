import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/admin-session"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { createTransferRecipient, initiateTransfer } from "@/services/paystack"
import monnify from "@/services/monnify"

type WithdrawalSource = "earner" | "advertiser" | "vendor"

export async function POST(req: Request) {
  const adminSession = await requireAdminSession()
  if ("errorResponse" in adminSession) {
    return adminSession.errorResponse as Response
  }

  try {
    const body = await req.json().catch(() => ({}))
    const withdrawalId = String(body?.withdrawalId || "").trim()
    const source = String(body?.source || "").trim() as WithdrawalSource

    if (!withdrawalId || !["earner", "advertiser", "vendor"].includes(source)) {
      return NextResponse.json({ success: false, message: "Missing withdrawal details" }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: "Firebase not initialized" }, { status: 500 })
    }

    const db = dbAdmin
    const withdrawalCollection = source === "advertiser" ? "advertiserWithdrawals" : source === "vendor" ? "vendorWithdrawals" : "earnerWithdrawals"
    const txCollection = source === "advertiser" ? "advertiserTransactions" : source === "vendor" ? "vendorTransactions" : "earnerTransactions"
    const userCollection = source === "advertiser" ? "advertisers" : source === "vendor" ? "vendors" : "earners"
    const withdrawalRef = db.collection(withdrawalCollection).doc(withdrawalId)
    const withdrawalSnap = await withdrawalRef.get()

    if (!withdrawalSnap.exists) {
      return NextResponse.json({ success: false, message: "Withdrawal request not found" }, { status: 404 })
    }

    const withdrawal = withdrawalSnap.data() || {}
    const status = String(withdrawal.status || "").toLowerCase()
    if (["sent", "completed"].includes(status)) {
      return NextResponse.json({ success: true, message: "Withdrawal was already processed" })
    }

    const userId = String(withdrawal.userId || "").trim()
    const amount = Number(withdrawal.amount || 0)
    const net = Number(withdrawal.net || Math.max(0, amount - Number(withdrawal.fee || 0)))
    const bank = withdrawal.bank || {}
    const provider = String(withdrawal.withdrawalProvider || "monnify").toLowerCase() === "paystack" ? "paystack" : "monnify"

    if (!userId || amount <= 0) {
      return NextResponse.json({ success: false, message: "Withdrawal record is incomplete" }, { status: 400 })
    }

    const userRef = db.collection(userCollection).doc(userId)
    const txQuery = await db
      .collection(txCollection)
      .where("userId", "==", userId)
      .where("type", "==", "withdrawal_request")
      .where("requestedAmount", "==", amount)
      .where("status", "==", "pending")
      .limit(5)
      .get()

    const recipientName = String(bank.accountName || withdrawal.fullName || withdrawal.name || "Pamba User").trim()

    if (provider === "monnify") {
      const disbursementResponse = await monnify.initiateDisbursement({
        amount: net,
        reference: withdrawalRef.id,
        narration: `Withdrawal for ${recipientName}`,
        destinationBankCode: String(bank.bankCode || ""),
        destinationAccountNumber: String(bank.accountNumber || ""),
        destinationAccountName: String(bank.accountName || recipientName || "Pamba User").trim(),
      })

      const withdrawalStatus = String(disbursementResponse?.status || "").toUpperCase() === "SUCCESS" ? "completed" : "sent"

      await db.runTransaction(async (transaction) => {
        const userSnap = await transaction.get(userRef)
        if (!userSnap.exists) {
          throw new Error("User not found")
        }

        const currentBalance = Number(userSnap.data()?.balance || 0)
        if (currentBalance < amount) {
          throw new Error("Insufficient balance at approval time")
        }

        transaction.update(userRef, {
          balance: admin.firestore.FieldValue.increment(-amount),
          totalWithdrawn: admin.firestore.FieldValue.increment(amount),
        })

        transaction.update(withdrawalRef, {
          status: withdrawalStatus,
          approvalStatus: "approved",
          approvedBy: adminSession.email,
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          initiatedAt: admin.firestore.FieldValue.serverTimestamp(),
          monnifyReference: disbursementResponse.reference || withdrawalRef.id,
          monnifyStatus: disbursementResponse.status || "PENDING",
          monnifyAmount: disbursementResponse.amount,
          monnifyDestinationBank: disbursementResponse.destinationBankName,
        })

        for (const txDoc of txQuery.docs) {
          transaction.update(txDoc.ref, {
            amount: -Math.abs(amount),
            status: "completed",
            note: "Withdrawal approved by admin",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
          })
        }
      })
    } else {
      const recipientCode = await createTransferRecipient({
        name: recipientName,
        accountNumber: String(bank.accountNumber || ""),
        bankCode: String(bank.bankCode || ""),
        currency: "NGN",
      }) as string

      const transferData = await initiateTransfer({
        recipient: recipientCode,
        amountKobo: Math.round(net * 100),
        reason: `Withdrawal for ${recipientName}`,
      }) as { id?: string | number; reference?: string; transfer_code?: string; status?: string }

      const withdrawalStatus = String(transferData?.status || "").toLowerCase() === "success" ? "completed" : "sent"

      await db.runTransaction(async (transaction) => {
        const userSnap = await transaction.get(userRef)
        if (!userSnap.exists) {
          throw new Error("User not found")
        }

        const currentBalance = Number(userSnap.data()?.balance || 0)
        if (currentBalance < amount) {
          throw new Error("Insufficient balance at approval time")
        }

        transaction.update(userRef, {
          balance: admin.firestore.FieldValue.increment(-amount),
          totalWithdrawn: admin.firestore.FieldValue.increment(amount),
        })

        transaction.update(withdrawalRef, {
          status: withdrawalStatus,
          approvalStatus: "approved",
          approvedBy: adminSession.email,
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          initiatedAt: admin.firestore.FieldValue.serverTimestamp(),
          paystackRecipient: recipientCode,
          paystackTransferId: transferData.id || null,
          paystackTransferReference: transferData.reference || transferData.transfer_code || null,
          paystackStatus: transferData.status || null,
        })

        for (const txDoc of txQuery.docs) {
          transaction.update(txDoc.ref, {
            amount: -Math.abs(amount),
            status: "completed",
            note: "Withdrawal approved by admin",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
          })
        }
      })
    }

    await db.collection("adminNotifications").add({
      type: "withdrawal_approved",
      title: "Withdrawal approved",
      body: `${recipientName} withdrawal of ₦${amount.toLocaleString()} was approved by admin.`,
      link: source === "advertiser" ? `/admin/advertisers/${userId}` : source === "vendor" ? `/admin/vendors` : `/admin/earners/${userId}`,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      actor: adminSession.email,
      userId,
      amount,
    })

    return NextResponse.json({ success: true, message: "Withdrawal approved and payout started" })
  } catch (error) {
    console.error("[admin][withdrawals][approve] failed", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to approve withdrawal" },
      { status: 500 }
    )
  }
}
