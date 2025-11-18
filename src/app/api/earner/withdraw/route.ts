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

    const PAYSTACK_BASE = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co'

    // Reuse Paystack recipient_code if available, otherwise create and persist
    let recipientCode = earner?.paystackRecipientCode
    if (!recipientCode) {
      const recipientRes = await fetch(`${PAYSTACK_BASE}/transferrecipient`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'nuban',
          name: bank.accountName || earner?.fullName || 'Recipient',
          account_number: bank.accountNumber,
          bank_code: bank.bankCode || '',
          currency: 'NGN',
        }),
      })
      const recipientJson = await recipientRes.json()
      if (!recipientRes.ok || !recipientJson.status) {
        console.error('Paystack create recipient error:', recipientJson)
        return NextResponse.json({ success: false, message: recipientJson.message || 'Failed to create transfer recipient' }, { status: 500 })
      }

      recipientCode = recipientJson.data.recipient_code
      // Persist recipient code for future reuse
      await earnerRef.update({ paystackRecipientCode: recipientCode })
    }

  // Initiate transfer (amount in kobo)
  const transferRes = await fetch(`${PAYSTACK_BASE}/transfer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: 'balance',
        amount: Math.round(amount * 100),
        recipient: recipientCode,
        reason: 'Earner withdrawal',
      }),
    })
    const transferJson = await transferRes.json()
    if (!transferRes.ok || !transferJson.status) {
      console.error('Paystack transfer error:', transferJson)
      return NextResponse.json({ success: false, message: transferJson.message || 'Transfer failed' }, { status: 500 })
    }

    // Record withdrawal and transaction in Firestore atomically
    const withdrawalRef = db.collection('earnerWithdrawals').doc()
    const txRef = db.collection('earnerTransactions').doc()

    await db.runTransaction(async (t) => {
      const snap = await t.get(earnerRef)
      if (!snap.exists) throw new Error('Earner not found during transaction')
      const currentBal = Number(snap.data()?.balance || 0)
      if (currentBal < amount) throw new Error('Insufficient balance')

      t.set(withdrawalRef, {
        userId,
        amount,
        fee,
        net,
        status: 'completed',
        bank,
        paystack: transferJson,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      t.set(txRef, {
        userId,
        type: 'withdrawal',
        amount: -amount,
        fee,
        net,
        status: 'completed',
        note: 'Withdrawal processed via Paystack',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      t.update(earnerRef, {
        balance: admin.firestore.FieldValue.increment(-amount),
      })
    })

    return NextResponse.json({ success: true, data: transferJson })
  } catch (err) {
    console.error('Withdrawal error', err)
    return NextResponse.json({ success: false, message: (err as Error).message || 'Server error' }, { status: 500 })
  }
}
    
