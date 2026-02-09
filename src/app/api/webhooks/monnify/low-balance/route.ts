import { NextRequest, NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import crypto from 'crypto'

/**
 * Monnify Low Balance Notification Webhook Handler
 * Receives alerts when wallet balance falls below threshold
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
      console.warn('[webhook][monnify][low-balance] Invalid signature')
      return NextResponse.json({ success: false, message: 'Invalid signature' }, { status: 401 })
    }

    const payload = JSON.parse(body)
    console.log('[webhook][monnify][low-balance] received alert', {
      eventType: payload.eventType,
      currentBalance: payload.eventData?.currentBalance,
    })

    const { eventType, eventData } = payload

    if (eventType === 'LOW_BALANCE_NOTIFICATION') {
      const { currentBalance, currency, threshold } = eventData

      console.log('[webhook][monnify][low-balance] low balance alert', {
        currentBalance,
        currency,
        threshold,
      })

      // Log alert and optionally send admin notification
      const { admin: adminSdk } = await initFirebaseAdmin()
      if (!adminSdk) {
        console.error('[webhook][monnify][low-balance] firebase-admin not initialized')
        return NextResponse.json({ success: false, message: 'Firebase not initialized' }, { status: 500 })
      }
      const db = adminSdk.firestore()
      await db.collection('alerts').add({
        type: 'low_balance',
        source: 'monnify',
        currentBalance,
        currency,
        threshold,
        createdAt: adminSdk.firestore.FieldValue.serverTimestamp(),
      })

      // Optionally notify admins
      const admins = await db.collection('users').where('role', '==', 'admin').get()
      for (const doc of admins.docs) {
        await db.collection('notifications').add({
          userId: doc.id,
          type: 'system_alert',
          title: 'Low Monnify Balance',
          message: `Monnify wallet balance is low: ${currency} ${currentBalance.toLocaleString()}. Threshold: ${currency} ${threshold.toLocaleString()}`,
          createdAt: adminSdk.firestore.FieldValue.serverTimestamp(),
          read: false,
        })
      }
    }

    return NextResponse.json({ success: true, message: 'Webhook processed' })
  } catch (error) {
    console.error('[webhook][monnify][low-balance] error', error)
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    )
  }
}
