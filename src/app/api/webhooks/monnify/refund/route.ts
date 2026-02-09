import { NextRequest, NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import crypto from 'crypto'

/**
 * Monnify Refund Webhook Handler
 * Receives refund completion notifications
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
      console.warn('[webhook][monnify][refund] Invalid signature')
      return NextResponse.json({ success: false, message: 'Invalid signature' }, { status: 401 })
    }

    const payload = JSON.parse(body)
    console.log('[webhook][monnify][refund] received event', {
      eventType: payload.eventType,
      reference: payload.eventData?.reference,
      status: payload.eventData?.status,
    })

    const { eventType, eventData } = payload

    if (eventType === 'REFUND_COMPLETION') {
      const { reference, status, amount, originalReference } = eventData

      console.log('[webhook][monnify][refund] processing refund', {
        reference,
        status,
        amount,
        originalReference,
      })

      // Log refund for audit
      const { admin: adminSdk } = await initFirebaseAdmin()
      if (!adminSdk) {
        console.error('[webhook][monnify][refund] firebase-admin not initialized')
        return NextResponse.json({ success: false, message: 'Firebase not initialized' }, { status: 500 })
      }
      const db = adminSdk.firestore()
      await db.collection('refunds').add({
        source: 'monnify',
        reference,
        originalReference,
        status,
        amount,
        createdAt: adminSdk.firestore.FieldValue.serverTimestamp(),
      })
    }

    return NextResponse.json({ success: true, message: 'Webhook processed' })
  } catch (error) {
    console.error('[webhook][monnify][refund] error', error)
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    )
  }
}
