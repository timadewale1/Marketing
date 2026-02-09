import { NextRequest, NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import crypto from 'crypto'

/**
 * Monnify Settlement Webhook Handler
 * Receives settlement notifications (funds settled to merchant account)
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
      console.warn('[webhook][monnify][settlement] Invalid signature')
      return NextResponse.json({ success: false, message: 'Invalid signature' }, { status: 401 })
    }

    const payload = JSON.parse(body)
    console.log('[webhook][monnify][settlement] received event', {
      eventType: payload.eventType,
      reference: payload.eventData?.reference,
      totalAmount: payload.eventData?.totalAmount,
    })

    const { eventType, eventData } = payload

    if (eventType === 'SETTLEMENT') {
      const { reference, totalAmount, currency, settlementDate, transactionCount } = eventData

      console.log('[webhook][monnify][settlement] settlement completed', {
        reference,
        totalAmount,
        currency,
        transactionCount,
      })

      // Log settlement for audit
      const { admin: adminSdk } = await initFirebaseAdmin()
      if (!adminSdk) {
        console.error('[webhook][monnify][settlement] firebase-admin not initialized')
        return NextResponse.json({ success: false, message: 'Firebase not initialized' }, { status: 500 })
      }
      const db = adminSdk.firestore()
      await db.collection('settlements').add({
        source: 'monnify',
        reference,
        totalAmount,
        currency,
        transactionCount,
        settlementDate,
        createdAt: adminSdk.firestore.FieldValue.serverTimestamp(),
      })
    }

    return NextResponse.json({ success: true, message: 'Webhook processed' })
  } catch (error) {
    console.error('[webhook][monnify][settlement] error', error)
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    )
  }
}
