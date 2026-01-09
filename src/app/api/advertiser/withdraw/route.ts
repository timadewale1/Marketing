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

    const advertiserRef = db.collection('advertisers').doc(userId)
    const advertiserSnap = await advertiserRef.get()
    if (!advertiserSnap.exists) return NextResponse.json({ success: false, message: 'Advertiser not found' }, { status: 404 })
    type BankField = { accountNumber?: string; bankCode?: string; accountName?: string; bankName?: string }
    type AdvertiserDoc = { balance?: number; bank?: BankField; fullName?: string }
    const advertiser = advertiserSnap.data() as AdvertiserDoc | null

    const bank = advertiser?.bank
    if (!bank || !bank.accountNumber || !bank.bankCode) {
      return NextResponse.json({ success: false, message: 'No bank details on file' }, { status: 400 })
    }

    const balance = Number(advertiser?.balance || 0)
    if (amount < 2000) return NextResponse.json({ success: false, message: 'Minimum withdrawal is ₦2,000' }, { status: 400 })
    if (balance < amount) return NextResponse.json({ success: false, message: 'Insufficient balance' }, { status: 400 })

    // Platform fee (10%) — send net amount via Paystack
    const fee = Math.round(amount * 0.1)
    const net = amount - fee

    // Create a withdrawal request record and reserve funds immediately.
    const withdrawalRef = db.collection('advertiserWithdrawals').doc()
    const txRef = db.collection('advertiserTransactions').doc()

    await db.runTransaction(async (t) => {
      const snap = await t.get(advertiserRef)
      if (!snap.exists) throw new Error('Advertiser not found during transaction')
      const currentBal = Number(snap.data()?.balance || 0)
      if (currentBal < amount) throw new Error('Insufficient balance')

      // Create a withdrawal request; we'll mark as 'processing' while we
      // attempt to initiate a Paystack transfer.
      t.set(withdrawalRef, {
        userId,
        amount,
        fee,
        net,
        status: 'processing',
        bank,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'advertiser',
      })

      // Create a lightweight transaction record to show a pending request in UI.
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

      // Reserve the withdrawn amount by decrementing advertiser balance immediately
      t.update(advertiserRef, { balance: admin.firestore.FieldValue.increment(-amount) })

      // Notify admin of advertiser withdrawal request
      const noteRef = db.collection('adminNotifications').doc()
      t.set(noteRef, {
        type: 'advertiser_withdrawal',
        title: 'Advertiser withdrawal request',
        body: `Advertiser ${userId} requested withdrawal of ₦${amount}`,
        link: `/admin/advertiser-withdrawals`,
        userId,
        amount,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    })

    // After the DB transaction, attempt to create a Paystack recipient and initiate transfer.
    try {
      const recipientName = advertiser.fullName || bank.accountName || 'Pamba User'
      console.log('[withdraw][advertiser] creating paystack recipient for', userId, { name: recipientName, bank })
      const recipientCode = await createTransferRecipient({ name: recipientName, accountNumber: bank.accountNumber!, bankCode: bank.bankCode!, currency: 'NGN' }) as string
      console.log('[withdraw][advertiser] recipient created', recipientCode)

      // Store recipientCode on advertiser doc for reuse.
      await advertiserRef.update({ paystackRecipientCode: recipientCode })

      const amountToSend = net
      console.log('[withdraw][advertiser] initiating transfer', recipientCode, amountToSend)
      const transferData = await initiateTransfer({ recipient: recipientCode, amountKobo: Math.round(amountToSend * 100), reason: `Withdrawal for ${recipientName}` }) as { id?: string; reference?: string; transfer_code?: string; status?: string }
      console.log('[withdraw][advertiser] transfer initiated', transferData)

      // Record transfer identifiers on withdrawal doc. We'll rely on webhook to finalize.
      await withdrawalRef.update({
        paystackRecipient: recipientCode,
        paystackTransferId: transferData.id || null,
        paystackTransferReference: transferData.reference || transferData.transfer_code || null,
        paystackStatus: transferData.status || null,
        initiatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    } catch (payErr) {
      console.error('Paystack transfer initiation failed', payErr)
      // Mark withdrawal as pending and attach error for admin review
      try { await withdrawalRef.update({ status: 'pending', paystackError: (payErr as Error).message || String(payErr) }) } catch (e) { console.error('Failed to update withdrawal doc after paystack error', e) }
      // Restore advertiser balance since transfer didn't start
      try { await advertiserRef.update({ balance: admin.firestore.FieldValue.increment(amount) }) } catch (e) { console.error('Failed to restore advertiser balance after paystack error', e) }
      return NextResponse.json({ success: false, message: 'Failed to initiate transfer; admin will review' }, { status: 502 })
    }

    return NextResponse.json({ success: true, message: 'Withdrawal initiated — transfer in progress' })
  } catch (err) {
    console.error('Withdrawal error', err)
    return NextResponse.json({ success: false, message: (err as Error).message || 'Server error' }, { status: 500 })
  }
}
