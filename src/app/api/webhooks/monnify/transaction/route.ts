import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { processActivationWithRetry, processWalletFundingWithRetry } from '@/lib/paymentProcessing'

/**
 * Monnify Transaction Webhook Handler
 * Receives transaction/payment completion notifications
 * 
 * Webhook events:
 * - SUCCESSFUL: Payment completed successfully
 * - FAILED: Payment failed
 */

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
    const body = await req.text()
    const signature = req.headers.get('monnify-signature')
    const secret = process.env.MONNIFY_SECRET_KEY!

    if (!verifyMonnifyWebhookSignature(body, signature, secret)) {
      console.warn('[webhook][monnify][transaction] Invalid signature')
      return NextResponse.json({ success: false, message: 'Invalid signature' }, { status: 401 })
    }

    const payload = JSON.parse(body)
    console.log('[webhook][monnify][transaction] received event', {
      eventType: payload.eventType,
      reference: payload.eventData?.reference,
      status: payload.eventData?.status,
    })

    // Initialize Firebase admin for processing
    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin || !admin) {
      console.error('[webhook][monnify][transaction] Firebase admin not initialized')
      return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
    }

    const { eventType, eventData } = payload

    if (eventType === 'TRANSACTION_COMPLETION') {
      const { reference, status, amount, transactionReference } = eventData

      console.log('[webhook][monnify][transaction] processing transaction', {
        reference,
        status,
        amount,
      })

      // Handle transaction completion - process activation and wallet funding
      if (status === 'SUCCESSFUL' || status === 'SUCCESS') {
        try {
          // Check if already processed (idempotency)
          const processedSnap = await dbAdmin.collection('processedWebhooks')
            .where('reference', '==', reference)
            .where('eventType', '==', 'TRANSACTION_COMPLETION')
            .limit(1)
            .get()

          if (!processedSnap.empty) {
            console.log('[webhook][monnify][transaction] already processed, skipping:', reference)
            return NextResponse.json({ success: true, message: 'Already processed' })
          }

          // Mark as processing to prevent concurrent processing
          await dbAdmin.collection('processedWebhooks').doc().set({
            reference,
            eventType: 'TRANSACTION_COMPLETION',
            status,
            amount,
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
          })
          // Check if this is an activation payment (reference might be userId or contain activation info)
          const activationSnap = await dbAdmin.collection('advertisers')
            .where('activationReference', '==', reference)
            .limit(1)
            .get()

          if (!activationSnap.empty) {
            // Process activation
            const advertiserDoc = activationSnap.docs[0]
            console.log('[webhook][monnify][transaction] processing activation for', advertiserDoc.id)

            try {
              await processActivationWithRetry(advertiserDoc.id, reference, 'monnify')
              console.log('[webhook][monnify][transaction] activation processed successfully')
            } catch (activationError) {
              console.error('[webhook][monnify][transaction] activation failed:', activationError)
            }
          } else {
            // Check if this is a wallet funding transaction
            const walletTxSnap = await dbAdmin.collection('advertiserTransactions')
              .where('reference', '==', reference)
              .where('type', '==', 'wallet_funding')
              .where('status', '==', 'pending')
              .limit(1)
              .get()

            if (!walletTxSnap.empty) {
              const txDoc = walletTxSnap.docs[0]
              const txData = txDoc.data()

              console.log('[webhook][monnify][transaction] processing wallet funding for', txData.userId)

              try {
                await processWalletFundingWithRetry(txData.userId, reference, Number(txData.amount || 0), 'monnify', 'advertiser')
                console.log('[webhook][monnify][transaction] wallet funding processed successfully')
              } catch (fundingError) {
                console.error('[webhook][monnify][transaction] wallet funding failed:', fundingError)
              }
            } else {
              // Check earner transactions too
              const earnerTxSnap = await dbAdmin.collection('earnerTransactions')
                .where('reference', '==', reference)
                .where('type', '==', 'wallet_funding')
                .where('status', '==', 'pending')
                .limit(1)
                .get()

              if (!earnerTxSnap.empty) {
                const txDoc = earnerTxSnap.docs[0]
                const txData = txDoc.data()

                console.log('[webhook][monnify][transaction] processing earner wallet funding for', txData.userId)

                try {
                  await processWalletFundingWithRetry(txData.userId, reference, Number(txData.amount || 0), 'monnify', 'earner')
                  console.log('[webhook][monnify][transaction] earner wallet funding processed successfully')
                } catch (fundingError) {
                  console.error('[webhook][monnify][transaction] earner wallet funding failed:', fundingError)
                }
              } else {
                console.log('[webhook][monnify][transaction] no matching transaction found for reference:', reference)
              }
            }
          }
        } catch (processError) {
          console.error('[webhook][monnify][transaction] failed to process transaction:', processError)
          // Don't return error - webhook should still acknowledge receipt
        }
      }

      // Log for audit purposes
      console.log('[webhook][monnify][transaction] transaction completed', {
        reference,
        transactionReference,
        status,
        amount,
      })
    }

    return NextResponse.json({ success: true, message: 'Webhook processed' })
  } catch (error) {
    console.error('[webhook][monnify][transaction] error', error)
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    )
  }
}
