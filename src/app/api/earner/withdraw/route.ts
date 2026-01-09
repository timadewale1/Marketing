import { NextResponse } from "next/server"
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { createTransferRecipient, initiateTransfer } from '@/services/paystack'

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

    // Platform fee (10%) — send net amount via Paystack
    const fee = Math.round(amount * 0.1)
    const net = amount - fee

    // Create withdrawal request, decrement earner balance and attempt instant transfer
    const withdrawalRef = db.collection('earnerWithdrawals').doc()
    const txRef = db.collection('earnerTransactions').doc()

    await db.runTransaction(async (t) => {
      const snap = await t.get(earnerRef)
      if (!snap.exists) throw new Error('Earner not found during transaction')
      const currentBal = Number(snap.data()?.balance || 0)
      if (currentBal < amount) throw new Error('Insufficient balance')

      // Create withdrawal request (processing while transfer is attempted)
      t.set(withdrawalRef, {
        userId,
        amount,
        fee,
        net,
        status: 'processing',
        bank,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Create a lightweight transaction record and decrement balance immediately
      t.set(txRef, {
        userId,
        type: 'withdrawal_request',
        amount: -amount,
        requestedAmount: amount,
        fee,
        net,
        status: 'pending',
        note: 'Withdrawal request pending transfer',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      t.update(earnerRef, { balance: admin.firestore.FieldValue.increment(-amount) })

      // Notify admin
      const noteRef = db.collection('adminNotifications').doc()
      t.set(noteRef, {
        type: 'earner_withdrawal',
        title: 'Earner withdrawal request',
        body: `Earner ${userId} requested withdrawal of ₦${amount}`,
        link: `/admin/earner-withdrawals`,
        userId,
        amount,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    })

    // Attempt Paystack recipient + transfer
    // Attempt Paystack recipient + transfer
    try {
      const recipientName = earner.fullName || bank.accountName || 'Pamba User'
      console.log('[withdraw][earner] creating paystack recipient for', userId, { name: recipientName, bank })
      const recipientCode = await createTransferRecipient({ name: recipientName, accountNumber: bank.accountNumber!, bankCode: bank.bankCode!, currency: 'NGN' })
      console.log('[withdraw][earner] recipient created', recipientCode)
      await earnerRef.update({ paystackRecipientCode: recipientCode })

      const amountToSend = net
      console.log('[withdraw][earner] initiating transfer', recipientCode, amountToSend)
      const transferData = await initiateTransfer({ recipient: String(recipientCode), amountKobo: Math.round(amountToSend * 100), reason: `Withdrawal for ${recipientName}` }) as { id?: string | number; reference?: string; transfer_code?: string; status?: string }
      console.log('[withdraw][earner] transfer initiated', transferData)

      await withdrawalRef.update({
        paystackRecipient: recipientCode,
        paystackTransferId: transferData.id || null,
        paystackTransferReference: transferData.reference || transferData.transfer_code || null,
        paystackStatus: transferData.status || null,
        initiatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    } catch (payErr) {
      console.error('Paystack transfer initiation failed', payErr)
      try { await withdrawalRef.update({ status: 'pending', paystackError: (payErr as Error).message || String(payErr) }) } catch (e) { console.error('Failed to update withdrawal doc after paystack error', e) }
      // restore balance since transfer didn't start
      try { await earnerRef.update({ balance: admin.firestore.FieldValue.increment(amount) }) } catch (e) { console.error('Failed to restore earner balance after paystack error', e) }
      return NextResponse.json({ success: false, message: 'Failed to initiate transfer; admin will review' }, { status: 502 })
    }

    return NextResponse.json({ success: true, message: 'Withdrawal initiated — transfer in progress' })
  } catch (err) {
    console.error('Withdrawal error', err)
    return NextResponse.json({ success: false, message: (err as Error).message || 'Server error' }, { status: 500 })
  }
}
    
