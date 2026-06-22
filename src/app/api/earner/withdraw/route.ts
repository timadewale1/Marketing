import { NextResponse } from "next/server"
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { getBankDetails } from '@/lib/bank-details'
import { sendAdminActionEmail } from '@/lib/mailer'
import { shouldAutoUnsuspendEarner } from '@/lib/earner-suspension'

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
    type EarnerDoc = {
      balance?: number
      activated?: boolean
      status?: string
      bank?: { accountNumber?: string; bankCode?: string; accountName?: string; bankName?: string }
      bankCode?: string
      bankName?: string
      accountNumber?: string
      accountName?: string
      fullName?: string
      paystackRecipientCode?: string
    }
    const earner = earnerSnap.data() as EarnerDoc | null
    if (earner && shouldAutoUnsuspendEarner(earner)) {
      await earnerRef.set({
        status: 'active',
        strikeCount: 0,
        suspensionReason: admin.firestore.FieldValue.delete(),
        suspendedAt: admin.firestore.FieldValue.delete(),
        suspensionReleaseAt: admin.firestore.FieldValue.delete(),
        suspensionDurationDays: admin.firestore.FieldValue.delete(),
        suspensionIndefinite: admin.firestore.FieldValue.delete(),
        lastStrikeUpdatedAt: admin.firestore.FieldValue.delete(),
      }, { merge: true })
      earner.status = 'active'
      earner.activated = Boolean(earner.activated)
    }

    if (String((earner as { status?: string } | null)?.status || '').toLowerCase() === 'suspended') {
      return NextResponse.json({ success: false, message: 'Your account is suspended. Please contact support for review.' }, { status: 403 })
    }

    if (!earner?.activated) {
      return NextResponse.json(
        {
          success: false,
          message: 'Your first N2,000 earned will be used to pay your one-time membership fee automatically before withdrawals are allowed.',
        },
        { status: 400 }
      )
    }

    const bank = getBankDetails(earner)
    if (!bank || !bank.accountNumber || !bank.bankCode) {
      return NextResponse.json({ success: false, message: 'No bank details on file' }, { status: 400 })
    }

    if (
      !earner?.bank ||
      earner.bank.accountNumber !== bank.accountNumber ||
      earner.bank.bankCode !== bank.bankCode ||
      earner.bank.accountName !== bank.accountName ||
      earner.bank.bankName !== bank.bankName
    ) {
      await earnerRef.set({ bank }, { merge: true })
    }

    const balance = Number(earner?.balance || 0)
    if (amount < 1000) return NextResponse.json({ success: false, message: 'Minimum withdrawal is ₦1,000' }, { status: 400 })
    if (balance < amount) return NextResponse.json({ success: false, message: 'Insufficient balance' }, { status: 400 })

    const existingWithdrawalsSnap = await db.collection('earnerWithdrawals').where('userId', '==', userId).get()
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
      earnerSnap.data()?.activationPaymentProvider ||
      earnerSnap.data()?.pendingActivationProvider ||
      'monnify'
    const activationPaymentProvider = activationPaymentProviderRaw === 'paystack' ? 'paystack' : 'monnify'

    // Platform fee (5%) — send net amount after fee
    const fee = Math.round(amount * 0.05)
    const net = amount - fee

    // Create withdrawal request and wait for admin approval before payout
    const withdrawalRef = db.collection('earnerWithdrawals').doc()
    const txRef = db.collection('earnerTransactions').doc()
    const earnerDisplayName = String(earner?.fullName || bank.accountName || 'Earner').trim()

    await db.runTransaction(async (t) => {
      const snap = await t.get(earnerRef)
      if (!snap.exists) throw new Error('Earner not found during transaction')
      const currentBal = Number(snap.data()?.balance || 0)
      if (currentBal < amount) throw new Error('Insufficient balance')

      // Create withdrawal request; admin will approve and send the payout later.
      t.set(withdrawalRef, {
        userId,
        amount,
        fee,
        net,
        status: 'processing',
        bank,
        withdrawalProvider: activationPaymentProvider,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Create a lightweight transaction record and decrement balance immediately
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

      // Notify admin
      const noteRef = db.collection('adminNotifications').doc()
      t.set(noteRef, {
        type: 'earner_withdrawal',
        title: 'Earner withdrawal request',
        body: `${earnerDisplayName} requested withdrawal of ₦${amount.toLocaleString()}`,
        link: `/admin/earner-withdrawals`,
        userId,
        amount,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    })

    sendAdminActionEmail({
      subject: `Earner withdrawal request - ₦${amount.toLocaleString()}`,
      title: 'Earner withdrawal request',
      message: `${earnerDisplayName} requested withdrawal of ₦${amount.toLocaleString()}.`,
      adminPath: `/admin/earners/${userId}`,
    }).catch((error) => {
      console.error('Failed to send admin withdrawal email', error)
    })

    await withdrawalRef.update({
      status: 'pending_admin_approval',
      approvalStatus: 'awaiting_admin',
      initiatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    try {
      await db.collection('earnerTransactions').doc(txRef.id).update({
        status: 'pending',
        note: 'Withdrawal request waiting for admin approval',
      })
    } catch (e) {
      console.warn('[withdraw][earner] failed to update withdrawal tx note', e)
    }

    return NextResponse.json({ success: true, message: 'Withdrawal request submitted and is waiting for admin approval' })
  } catch (err) {
    console.error('Withdrawal error', err)
    return NextResponse.json({ success: false, message: (err as Error).message || 'Server error' }, { status: 500 })
  }
}
