import { NextRequest, NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import crypto from 'crypto'

/**
 * Monnify Disbursement Webhook Handler
 * Receives disbursement status updates from Monnify
 * 
 * Webhook events:
 * - SUCCESSFUL: Disbursement completed successfully
 * - PENDING: Disbursement is being processed
 * - FAILED: Disbursement failed
 */

// Verify webhook signature from Monnify
function verifyMonnifyWebhookSignature(
  body: string,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!signature) return false

  const hash = crypto
    .createHmac('sha512', secret)
    .update(body)
    .digest('hex')

  return hash === signature
}

export async function POST(req: NextRequest) {
  try {
    // Get raw body for signature verification
    const body = await req.text()
    const signature = req.headers.get('monnify-signature')
    const secret = process.env.MONNIFY_SECRET_KEY!

    // Verify webhook authenticity
    if (!verifyMonnifyWebhookSignature(body, signature, secret)) {
      console.warn('[webhook][monnify][disbursement] Invalid signature')
      return NextResponse.json({ success: false, message: 'Invalid signature' }, { status: 401 })
    }

    const payload = JSON.parse(body)
    console.log('[webhook][monnify][disbursement] received event', {
      eventType: payload.eventType,
      reference: payload.eventData?.reference,
      status: payload.eventData?.status,
    })

    const { eventType, eventData } = payload

    // Handle disbursement events
    if (eventType === 'DISBURSEMENT') {
      const { reference, status, amount, transactionReference } = eventData

      console.log('[webhook][monnify][disbursement] processing disbursement', {
        reference,
        status,
        amount,
      })

      // Find withdrawal record by monnifyReference
      const { admin: adminSdk } = await initFirebaseAdmin()
      if (!adminSdk) {
        console.error('[webhook][monnify][disbursement] firebase-admin not initialized')
        return NextResponse.json({ success: false, message: 'Firebase not initialized' }, { status: 500 })
      }
      const db = adminSdk.firestore()
      const withdrawalsRef = db.collectionGroup('withdrawals')
      const snapshot = await withdrawalsRef.where('monnifyReference', '==', reference).get()

      if (snapshot.empty) {
        console.warn(`[webhook][monnify][disbursement] withdrawal not found for reference ${reference}`)
        return NextResponse.json({ success: true, message: 'Event received but withdrawal not found' })
      }

      // Update withdrawal record with status
      const updates: Record<string, unknown> = {
        monnifyStatus: status,
        updatedAt: adminSdk.firestore.FieldValue.serverTimestamp(),
      }

      // Map Monnify status to our internal status
      if (status === 'SUCCESSFUL' || status === 'SUCCESS') {
        updates.status = 'completed'
      } else if (status === 'FAILED') {
        updates.status = 'failed'
      } else if (status === 'PENDING') {
        updates.status = 'pending'
      }

      // Store additional data if provided
      if (transactionReference) {
        updates.monnifyTransactionReference = transactionReference
      }

      // Update all matching withdrawals
      for (const doc of snapshot.docs) {
        await doc.ref.update(updates)
        console.log(`[webhook][monnify][disbursement] updated withdrawal ${doc.id}`, updates)

        // If disbursement failed, we might want to restore balance
        if (status === 'FAILED') {
          const withdrawal = doc.data()
          if (withdrawal.userId && withdrawal.amount) {
            const userRef = db.collection('users').doc(withdrawal.userId)
            const userDoc = await userRef.get()

            if (userDoc.exists && (userDoc.data()?.role === 'advertiser' || userDoc.data()?.role === 'earner')) {
              // Restore balance
              const balanceField = userDoc.data()?.role === 'advertiser' ? 'balance' : 'balance'
              await userRef.update({
                [balanceField]: adminSdk.firestore.FieldValue.increment(withdrawal.amount),
              })
              console.log(`[webhook][monnify][disbursement] restored balance for user ${withdrawal.userId}`)

              // Store failure notification
              await db.collection('notifications').add({
                userId: withdrawal.userId,
                type: 'withdrawal_failed',
                title: 'Withdrawal Failed',
                message: `Your ₦${withdrawal.amount.toLocaleString()} withdrawal failed. Amount has been refunded to your wallet.`,
                reference: reference,
                createdAt: adminSdk.firestore.FieldValue.serverTimestamp(),
                read: false,
              })
            }
          }
        }

        // If successful, create success notification
        if (status === 'SUCCESSFUL' || status === 'SUCCESS') {
          const withdrawal = doc.data()
          if (withdrawal.userId) {
            await db.collection('notifications').add({
              userId: withdrawal.userId,
              type: 'withdrawal_successful',
              title: 'Withdrawal Successful',
              message: `Your ₦${withdrawal.amount.toLocaleString()} withdrawal was successful!`,
              reference: reference,
              createdAt: adminSdk.firestore.FieldValue.serverTimestamp(),
              read: false,
            })
          }
        }
      }
    }

    return NextResponse.json({ success: true, message: 'Webhook processed' })
  } catch (error) {
    console.error('[webhook][monnify][disbursement] error', error)
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    )
  }
}
