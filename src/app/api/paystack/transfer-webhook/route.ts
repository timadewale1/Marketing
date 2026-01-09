import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { verifyWebhookSignature } from '@/services/paystack'

interface WithdrawalUpdate {
  paystackStatus: string | null
  updatedAt: import('firebase-admin').firestore.FieldValue
  status?: string
  sentAt?: import('firebase-admin').firestore.FieldValue | undefined
  failedAt?: import('firebase-admin').firestore.FieldValue | undefined
}

export async function POST(req: Request) {
  try {
    const raw = await req.text()
    const signature = req.headers.get('x-paystack-signature')
    if (!verifyWebhookSignature(raw, signature)) {
      console.warn('Invalid Paystack webhook signature')
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const payload = JSON.parse(raw)
    const event = payload.event
    const data = payload.data

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) return NextResponse.json({ ok: false }, { status: 500 })
    const db = dbAdmin as import('firebase-admin').firestore.Firestore

    // We handle transfer.success and transfer.failed
    if (!data) return NextResponse.json({ ok: true })

    const transferId = data.id || data.transfer_id || null
    const reference = data.reference || data.transfer_code || null
    const status = data.status || null

    // Search both advertiserWithdrawals and earnerWithdrawals
    const collections = ['advertiserWithdrawals', 'earnerWithdrawals']
    for (const col of collections) {
      const qById = await db.collection(col).where('paystackTransferId', '==', transferId).get()
      const qByRef = await db.collection(col).where('paystackTransferReference', '==', reference).get()
      const docs = [...qById.docs, ...qByRef.docs]
      for (const d of docs) {
        const wd = d.data()
        const updates: WithdrawalUpdate = { paystackStatus: status, updatedAt: admin.firestore.FieldValue.serverTimestamp() }
        if (event === 'transfer.success' || status === 'success') {
          updates.status = 'sent'
          updates.sentAt = admin.firestore.FieldValue.serverTimestamp()
        } else if (event === 'transfer.failed' || status === 'failed') {
          updates.status = 'failed'
          updates.failedAt = admin.firestore.FieldValue.serverTimestamp()
        }
        try {
          await d.ref.update(Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined)))

          if (updates.status === 'sent') {
            // finalize transactions: find pending withdrawal_request txs and mark completed
            const txCollection = col === 'advertiserWithdrawals' ? 'advertiserTransactions' : 'earnerTransactions'
            const userCollection = col === 'advertiserWithdrawals' ? 'advertisers' : 'earners'
            const txsSnap = await db.collection(txCollection)
              .where('userId', '==', wd.userId)
              .where('type', '==', 'withdrawal_request')
              .where('requestedAmount', '==', wd.amount)
              .where('status', '==', 'pending')
              .get()

            if (!txsSnap.empty) {
              const batch = db.batch()
              txsSnap.docs.forEach((t) => {
                batch.update(t.ref, {
                  amount: -Math.abs(wd.amount || 0),
                  status: 'completed',
                  note: 'Withdrawal processed via Paystack',
                  completedAt: admin.firestore.FieldValue.serverTimestamp(),
                })
              })
              await batch.commit()
            } else {
              await db.collection(txCollection).add({
                userId: wd.userId,
                type: 'withdrawal',
                amount: -Math.abs(wd.amount || 0),
                fee: wd.fee || 0,
                net: wd.net || wd.amount,
                status: 'completed',
                note: 'Withdrawal processed via Paystack',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              })
            }

            // Update user's totalWithdrawn (balance was already reserved at request time)
            await db.collection(userCollection).doc(wd.userId).update({
              totalWithdrawn: admin.firestore.FieldValue.increment(Number(wd.amount) || 0),
            })
          }
        } catch (e) {
          console.error('Error updating withdrawal after webhook', e)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Paystack webhook error', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
