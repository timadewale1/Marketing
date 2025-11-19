import { NextResponse } from "next/server"
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const amount = Number(body?.amount || 0)

    if (!amount || amount <= 0) {
      return NextResponse.json({ success: false, message: 'Invalid amount' }, { status: 400 })
    }

    // Verify Firebase ID token from Authorization header
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Missing Authorization token' }, { status: 401 })
    }
    const idToken = authHeader.split('Bearer ')[1]

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin || !admin) return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })

    const db = dbAdmin as import('firebase-admin').firestore.Firestore

    // Verify ID token and get uid
    let verifiedUid: string
    try {
      const decoded = await admin.auth().verifyIdToken(idToken)
      verifiedUid = decoded.uid
    } catch (err) {
      console.error('Invalid ID token', err)
      return NextResponse.json({ success: false, message: 'Invalid ID token' }, { status: 401 })
    }

    // Use verifiedUid as the acting user ID
    const userId = verifiedUid

    const earnerRef = db.collection('earners').doc(userId)
    const earnerSnap = await earnerRef.get()
    if (!earnerSnap.exists) return NextResponse.json({ success: false, message: 'Earner not found' }, { status: 404 })
    type BankField = { accountNumber?: string; bankCode?: string; accountName?: string; bankName?: string }
    type EarnerDoc = { balance?: number; bank?: BankField; fullName?: string; paystackRecipientCode?: string }
    const earner = earnerSnap.data() as EarnerDoc | null

    const bank = earner?.bank
    if (!bank || !bank.accountNumber || !bank.bankCode) {
      return NextResponse.json({ success: false, message: 'No bank details on file' }, { status: 400 })
    }

    const balance = Number(earner?.balance || 0)
    if (balance < amount) return NextResponse.json({ success: false, message: 'Insufficient balance' }, { status: 400 })

    const fee = Math.round(amount * 0.1)
    const net = amount - fee

    // PAYSTACK DVA is not available currently. Instead of initiating an automatic
    // transfer, create a withdrawal request record for admin review. Admin will
    // mark the request as 'sent' once processing with Paystack is complete.
    // We do NOT decrement the earner balance here; the admin should handle
    // finalization and accounting when marking as completed.

    const withdrawalRef = db.collection('earnerWithdrawals').doc()
    const txRef = db.collection('earnerTransactions').doc()

    await db.runTransaction(async (t) => {
      const snap = await t.get(earnerRef)
      if (!snap.exists) throw new Error('Earner not found during transaction')
      const currentBal = Number(snap.data()?.balance || 0)
      if (currentBal < amount) throw new Error('Insufficient balance')

      // Create a pending withdrawal request
      t.set(withdrawalRef, {
        userId,
        amount,
        fee,
        net,
        status: 'pending',
        bank,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Create a lightweight transaction record to show a pending request in UI.
      // Do not alter balance yet; admin will create the final transaction on approval.
      t.set(txRef, {
        userId,
        type: 'withdrawal_request',
        amount: 0,
        requestedAmount: amount,
        fee,
        net,
        status: 'pending',
        note: 'Withdrawal request pending admin approval',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    })

    return NextResponse.json({ success: true, message: 'Withdrawal request created and awaiting admin approval' })
  } catch (err) {
    console.error('Withdrawal error', err)
    return NextResponse.json({ success: false, message: (err as Error).message || 'Server error' }, { status: 500 })
  }
}
    
