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

    const customerRef = db.collection("customers").doc(verifiedUid)
    const customerSnap = await customerRef.get()
    if (!customerSnap.exists) return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 })

    type BankField = { accountNumber?: string; bankCode?: string; accountName?: string; bankName?: string }
    type CustomerDoc = { balance?: number; bank?: BankField; name?: string; fullName?: string; email?: string }
    const customer = customerSnap.data() as CustomerDoc | null

    const bank = customer?.bank
    if (!bank || !bank.accountNumber || !bank.bankCode || !bank.accountName) {
      return NextResponse.json({ success: false, message: "Please complete your bank details first" }, { status: 400 })
    }

    const balance = Number(customer?.balance || 0)
    if (amount < 1000) return NextResponse.json({ success: false, message: "Minimum withdrawal is ₦1,000" }, { status: 400 })
    if (balance < amount) return NextResponse.json({ success: false, message: "Insufficient balance" }, { status: 400 })

    const existingWithdrawalsSnap = await db.collection("customerWithdrawals").where("userId", "==", verifiedUid).get()
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

    const fee = Math.round(amount * 0.05)
    const net = amount - fee
    const customerDisplayName = String(customer?.fullName || customer?.name || bank.accountName || "Customer").trim()
    const withdrawalRef = db.collection("customerWithdrawals").doc()
    const txRef = db.collection("customerTransactions").doc()

    await db.runTransaction(async (t) => {
      const snap = await t.get(customerRef)
      if (!snap.exists) throw new Error("Customer not found during transaction")
      const currentBal = Number(snap.data()?.balance || 0)
      if (currentBal < amount) throw new Error("Insufficient balance")

      t.set(withdrawalRef, {
        userId: verifiedUid,
        amount,
        fee,
        net,
        status: "pending_admin_approval",
        approvalStatus: "awaiting_admin",
        bank,
        withdrawalProvider: "monnify",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        initiatedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: "customer",
      })

      t.set(txRef, {
        userId: verifiedUid,
        withdrawalId: withdrawalRef.id,
        type: "withdrawal_request",
        amount: -amount,
        requestedAmount: amount,
        fee,
        net,
        status: "pending",
        note: "Withdrawal request waiting for admin approval",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      t.set(db.collection("adminNotifications").doc(), {
        type: "customer_withdrawal",
        title: "Customer withdrawal request",
        body: `${customerDisplayName} requested withdrawal of ₦${amount.toLocaleString()}`,
        link: "/admin/users",
        userId: verifiedUid,
        amount,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    })

    sendAdminActionEmail({
      subject: `Customer withdrawal request - ₦${amount.toLocaleString()}`,
      title: "Customer withdrawal request",
      message: `${customerDisplayName} requested withdrawal of ₦${amount.toLocaleString()}.`,
      adminPath: "/admin/users",
    }).catch((error) => {
      console.error("Failed to send customer withdrawal email", error)
    })

    return NextResponse.json({ success: true, message: "Withdrawal request submitted and is waiting for admin approval" })
  } catch (err) {
    console.error("Customer withdrawal error", err)
    return NextResponse.json({ success: false, message: (err as Error).message || "Server error" }, { status: 500 })
  }
}
