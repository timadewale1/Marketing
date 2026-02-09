import { NextRequest, NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import crypto from 'crypto'

/**
 * Monnify Wallet Activity Webhook Handler
 * Receives wallet activity notifications
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
      console.warn('[webhook][monnify][wallet-activity] Invalid signature')
      return NextResponse.json({ success: false, message: 'Invalid signature' }, { status: 401 })
    }

    const payload = JSON.parse(body)
    console.log('[webhook][monnify][wallet-activity] received event', {
      eventType: payload.eventType,
      transactionType: payload.eventData?.transactionType,
      amount: payload.eventData?.amount,
    })

    const { eventType, eventData } = payload

    if (eventType === 'WALLET_ACTIVITY_NOTIFICATION') {
      const { transactionType, amount, reference, narration } = eventData

      console.log('[webhook][monnify][wallet-activity] wallet activity', {
        transactionType,
        amount,
        reference,
      })

      // Log for audit
      const { admin: adminSdk } = await initFirebaseAdmin()
      if (!adminSdk) {
        console.error('[webhook][monnify][wallet-activity] firebase-admin not initialized')
        return NextResponse.json({ success: false, message: 'Firebase not initialized' }, { status: 500 })
      }
      const db = adminSdk.firestore()
      await db.collection('wallet_activities').add({
        source: 'monnify',
        transactionType,
        amount,
        reference,
        narration,
        createdAt: adminSdk.firestore.FieldValue.serverTimestamp(),
      })
    }

    return NextResponse.json({ success: true, message: 'Webhook processed' })
  } catch (error) {
    console.error('[webhook][monnify][wallet-activity] error', error)
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    )
  }
}
