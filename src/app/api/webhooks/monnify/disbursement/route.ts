import { NextRequest, NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import crypto from 'crypto'

/**
 * Monnify Disbursement Webhook Handler
 * Receives disbursement status updates from Monnify
 * 
 * Webhook events:
 * - SUCCESSFUL_DISBURSEMENT: Disbursement completed successfully
 * - FAILED_DISBURSEMENT: Disbursement failed
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

    // Handle disbursement events (both successful and failed)
    if (eventType === 'SUCCESSFUL_DISBURSEMENT' || eventType === 'FAILED_DISBURSEMENT') {
      const { reference, status, amount, transactionReference } = eventData

      console.log('[webhook][monnify][disbursement] processing disbursement', {
        eventType,
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
      
      // Search both earner and advertiser withdrawals
      const earnerSnapshot = await db.collection('earnerWithdrawals').where('monnifyReference', '==', reference).get()
      const advertiserSnapshot = await db.collection('advertiserWithdrawals').where('monnifyReference', '==', reference).get()
      const allDocs = [...earnerSnapshot.docs, ...advertiserSnapshot.docs]

      if (allDocs.length === 0) {
        console.warn(`[webhook][monnify][disbursement] withdrawal not found for reference ${reference}`)
        return NextResponse.json({ success: true, message: 'Event received but withdrawal not found' })
      }

      let userType: 'earner' | 'advertiser' | null = null
      if (earnerSnapshot.docs.length > 0) userType = 'earner'
      else if (advertiserSnapshot.docs.length > 0) userType = 'advertiser'

      // Update withdrawal record with status
      const updates: Record<string, unknown> = {
        monnifyStatus: status,
        updatedAt: adminSdk.firestore.FieldValue.serverTimestamp(),
      }

      // Map Monnify status to our internal status
      if (status === 'SUCCESS') {
        updates.status = 'completed'
      } else if (status === 'FAILED') {
        updates.status = 'failed'
      }

      // Store additional data if provided
      if (transactionReference) {
        updates.monnifyTransactionReference = transactionReference
      }

      // Update all matching withdrawals
      for (const doc of allDocs) {
        const withdrawal = doc.data()
        await doc.ref.update(updates)
        console.log(`[webhook][monnify][disbursement] updated withdrawal ${doc.id}`, updates)

        // If disbursement failed, restore balance
        if (status === 'FAILED' && withdrawal.userId && withdrawal.amount) {
          const userCollection = userType === 'earner' ? 'earners' : 'advertisers'
          const userRef = db.collection(userCollection).doc(withdrawal.userId)
          await userRef.update({
            balance: adminSdk.firestore.FieldValue.increment(withdrawal.amount),
          })
          console.log(`[webhook][monnify][disbursement] restored ₦${withdrawal.amount} balance for ${userType} ${withdrawal.userId}`)
        }

        // Log success notification
        if (status === 'SUCCESS' && withdrawal.userId) {
          console.log(`[webhook][monnify][disbursement] disbursement successful for user ${withdrawal.userId}, amount: ₦${withdrawal.amount}`)
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
