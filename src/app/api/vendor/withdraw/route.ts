import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { sendAdminActionEmail } from "@/lib/mailer"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const amount = Number(body?.amount || 0)
    if (!amount || amount <= 0) {
      return NextResponse.json({ success: false, message: "Invalid amount" }, { status: 400 })
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, message: "Missing Authorization token" }, { status: 401 })
    }
    const idToken = authHeader.split("Bearer ")[1]

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin || !admin) return NextResponse.json({ success: false, message: "Server admin unavailable" }, { status: 500 })
    const db = dbAdmin as import("firebase-admin").firestore.Firestore

    let verifiedUid: string
    try {
      const decoded = await admin.auth().verifyIdToken(idToken)
      verifiedUid = decoded.uid
    } catch (err) {
      console.error("Invalid ID token", err)
      return NextResponse.json({ success: false, message: "Invalid ID token" }, { status: 401 })
    }

    const userId = verifiedUid
    const vendorRef = db.collection("vendors").doc(userId)
    const vendorSnap = await vendorRef.get()
    if (!vendorSnap.exists) return NextResponse.json({ success: false, message: "Vendor not found" }, { status: 404 })
    type BankField = { accountNumber?: string; bankCode?: string; accountName?: string; bankName?: string }
    type VendorDoc = { balance?: number; bank?: BankField; name?: string; fullName?: string }
    const vendor = vendorSnap.data() as VendorDoc | null

    const bank = vendor?.bank
    if (!bank || !bank.accountNumber || !bank.bankCode) {
      return NextResponse.json({ success: false, message: "No bank details on file" }, { status: 400 })
    }

    const balance = Number(vendor?.balance || 0)
    if (amount < 1000) return NextResponse.json({ success: false, message: "Minimum withdrawal is ₦1,000" }, { status: 400 })
    if (balance < amount) return NextResponse.json({ success: false, message: "Insufficient balance" }, { status: 400 })

    const existingWithdrawalsSnap = await db.collection("vendorWithdrawals").where("userId", "==", userId).get()
    const pendingWithdrawals = existingWithdrawalsSnap.docs.reduce((sum, snap) => {
      const status = String(snap.data()?.status || "").toLowerCase()
      if (status === "pending" || status === "pending_admin_approval" || status === "processing") {
        return sum + Number(snap.data()?.amount || 0)
      }
      return sum
    }, 0)
    if (pendingWithdrawals + amount > balance) {
      return NextResponse.json({ success: false, message: "You already have a pending withdrawal request waiting for admin approval" }, { status: 400 })
    }

    const withdrawalProviderRaw = vendorSnap.data()?.activationPaymentProvider || "monnify"
    const withdrawalProvider = withdrawalProviderRaw === "paystack" ? "paystack" : "monnify"
    const fee = Math.round(amount * 0.05)
    const net = amount - fee

    const withdrawalRef = db.collection("vendorWithdrawals").doc()
    const txRef = db.collection("vendorTransactions").doc()
    const vendorDisplayName = String(vendor?.fullName || vendor?.name || bank.accountName || "Vendor").trim()

    await db.runTransaction(async (t) => {
      const snap = await t.get(vendorRef)
      if (!snap.exists) throw new Error("Vendor not found during transaction")
      const currentBal = Number(snap.data()?.balance || 0)
      if (currentBal < amount) throw new Error("Insufficient balance")

      t.set(withdrawalRef, {
        userId,
        amount,
        fee,
        net,
        status: "processing",
        bank,
        withdrawalProvider,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        source: "vendor",
      })

      t.set(txRef, {
        userId,
        withdrawalId: withdrawalRef.id,
        type: "withdrawal_request",
        amount: -amount,
        requestedAmount: amount,
        fee,
        net,
        status: "pending",
        note: "Withdrawal request pending transfer",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      const noteRef = db.collection("adminNotifications").doc()
      t.set(noteRef, {
        type: "vendor_withdrawal",
        title: "Vendor withdrawal request",
        body: `${vendorDisplayName} requested withdrawal of ₦${amount.toLocaleString()}`,
        link: `/admin/vendors`,
        userId,
        amount,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    })

    sendAdminActionEmail({
      subject: `Vendor withdrawal request - ₦${amount.toLocaleString()}`,
      title: "Vendor withdrawal request",
      message: `${vendorDisplayName} requested withdrawal of ₦${amount.toLocaleString()}.`,
      adminPath: `/admin/vendors`,
    }).catch((error) => {
      console.error("Failed to send admin withdrawal email", error)
    })

    await withdrawalRef.update({
      status: "pending_admin_approval",
      approvalStatus: "awaiting_admin",
      initiatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    try {
      await db.collection("vendorTransactions").doc(txRef.id).update({
        status: "pending",
        note: "Withdrawal request waiting for admin approval",
      })
    } catch (error) {
      console.warn("[withdraw][vendor] failed to update withdrawal tx note", error)
    }

    return NextResponse.json({ success: true, message: "Withdrawal request submitted and is waiting for admin approval" })
  } catch (err) {
    console.error("Vendor withdrawal error", err)
    return NextResponse.json({ success: false, message: (err as Error).message || "Server error" }, { status: 500 })
  }
}
