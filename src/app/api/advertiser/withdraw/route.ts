import { NextResponse } from "next/server"
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { sendAdminActionEmail } from '@/lib/mailer'

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
    type AdvertiserDoc = { balance?: number; bank?: BankField; fullName?: string; name?: string }
    const advertiser = advertiserSnap.data() as AdvertiserDoc | null

    const bank = advertiser?.bank
    if (!bank || !bank.accountNumber || !bank.bankCode) {
      return NextResponse.json({ success: false, message: 'No bank details on file' }, { status: 400 })
    }

    const balance = Number(advertiser?.balance || 0)
    if (amount < 1000) return NextResponse.json({ success: false, message: 'Minimum withdrawal is ₦1,000' }, { status: 400 })
    if (balance < amount) return NextResponse.json({ success: false, message: 'Insufficient balance' }, { status: 400 })

    const existingWithdrawalsSnap = await db.collection('advertiserWithdrawals').where('userId', '==', userId).get()
    const pendingWithdrawals = existingWithdrawalsSnap.docs.reduce((sum, snap) => {
      const status = String(snap.data()?.status || '').toLowerCase()
      if (status === 'pending' || status === 'pending_admin_approval' || status === 'processing') {
        return sum + Number(snap.data()?.amount || 0)
      }
      return sum
    }, 0)
    if (pendingWithdrawals + amount > balance) {
      return NextResponse.json({ success: false, message: 'You already have a pending withdrawal request waiting for admin approval' }, { status: 400 })
    }

    // Check which payment provider was used for activation
    const activationPaymentProviderRaw =
      advertiserSnap.data()?.activationPaymentProvider ||
      advertiserSnap.data()?.pendingActivationProvider ||
      'monnify'
    const activationPaymentProvider = activationPaymentProviderRaw === 'paystack' ? 'paystack' : 'monnify'

    // Platform fee (5%) — send net amount after fee
    const fee = Math.round(amount * 0.05)
    const net = amount - fee

    // Create a withdrawal request record and wait for admin approval before payout.
    const withdrawalRef = db.collection('advertiserWithdrawals').doc()
    const txRef = db.collection('advertiserTransactions').doc()
    const advertiserDisplayName = String(advertiser?.fullName || advertiser?.name || bank.accountName || 'Advertiser').trim()

    await db.runTransaction(async (t) => {
      const snap = await t.get(advertiserRef)
      if (!snap.exists) throw new Error('Advertiser not found during transaction')
      const currentBal = Number(snap.data()?.balance || 0)
      if (currentBal < amount) throw new Error('Insufficient balance')

      // Create a withdrawal request; admin will approve and send the payout later.
      t.set(withdrawalRef, {
        userId,
        amount,
        fee,
        net,
        status: 'processing',
        bank,
        withdrawalProvider: activationPaymentProvider,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'advertiser',
      })

      // Create a lightweight transaction record to show a pending request in UI.
      t.set(txRef, {
        userId,
        withdrawalId: withdrawalRef.id,
        type: 'withdrawal_request',
        amount: -amount,
        requestedAmount: amount,
        fee,
        net,
        status: 'pending',
        note: 'Withdrawal request pending transfer',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Notify admin of advertiser withdrawal request
      const noteRef = db.collection('adminNotifications').doc()
      t.set(noteRef, {
        type: 'advertiser_withdrawal',
        title: 'Advertiser withdrawal request',
        body: `${advertiserDisplayName} requested withdrawal of ₦${amount.toLocaleString()}`,
        link: `/admin/advertiser-withdrawals`,
        userId,
        amount,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    })

    sendAdminActionEmail({
      subject: `Advertiser withdrawal request - ₦${amount.toLocaleString()}`,
      title: 'Advertiser withdrawal request',
      message: `${advertiserDisplayName} requested withdrawal of ₦${amount.toLocaleString()}.`,
      adminPath: `/admin/advertisers/${userId}`,
    }).catch((error) => {
      console.error('Failed to send admin withdrawal email', error)
    })

    await withdrawalRef.update({
      status: 'pending_admin_approval',
      approvalStatus: 'awaiting_admin',
      initiatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    try {
      await db.collection('advertiserTransactions').doc(txRef.id).update({
        status: 'pending',
        note: 'Withdrawal request waiting for admin approval',
      })
    } catch (e) {
      console.warn('[withdraw][advertiser] failed to update withdrawal tx note', e)
    }

    return NextResponse.json({ success: true, message: 'Withdrawal request submitted and is waiting for admin approval' })
  } catch (err) {
    console.error('Withdrawal error', err)
    return NextResponse.json({ success: false, message: (err as Error).message || 'Server error' }, { status: 500 })
  }
}
