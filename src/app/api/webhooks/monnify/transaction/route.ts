import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

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

    const { eventType, eventData } = payload

    if (eventType === 'TRANSACTION_COMPLETION') {
      const { reference, status, amount, transactionReference } = eventData

      console.log('[webhook][monnify][transaction] processing transaction', {
        reference,
        status,
        amount,
      })

      // Handle transaction completion - this is handled by SDK callback
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
