import { NextRequest, NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore'
import { extractMonnifyReferenceCandidates, processWalletFundingWithRetry } from '@/lib/paymentProcessing'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('verify-payment called with body:', JSON.stringify(body))
    const { reference, campaignData, type, userId, amount, provider, monnifyResponse } = body

    if (!reference) {
      return NextResponse.json({ success: false, message: 'Missing payment reference' }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin || !admin) {
      return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })
    }
    const adminDb = dbAdmin as AdminFirestore
    const referenceCandidates = provider === 'monnify'
      ? extractMonnifyReferenceCandidates(String(reference), monnifyResponse || null)
      : [String(reference)]

    if (provider === 'monnify') {
      try {
        console.log('Monnify SDK payment verification - trusting SDK callback')
        if (monnifyResponse) {
          console.log('Monnify SDK response:', JSON.stringify(monnifyResponse).substring(0, 200))
          if (referenceCandidates.length === 0) {
            return NextResponse.json(
              { success: false, message: 'Invalid Monnify SDK response - missing reference' },
              { status: 400 }
            )
          }
        }
        console.log('Monnify payment verified via SDK callback')
      } catch (e) {
        console.error('Monnify verification failed:', e)
        return NextResponse.json(
          { success: false, message: 'Unable to verify Monnify payment' },
          { status: 500 }
        )
      }
    }

    if (campaignData) {
      try {
        await adminDb.collection('campaigns').add({
          ...campaignData,
          paymentRef: reference,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        await adminDb.collection('adminNotifications').add({
          type: 'campaign_created',
          title: 'New campaign (paid)',
          body: `${String(campaignData.title || 'Untitled')} was created via payment`,
          link: '/admin/campaigns',
          campaignTitle: String(campaignData.title || ''),
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      } catch (e) {
        console.error('Failed to create campaign:', e)
        return NextResponse.json({ success: false, message: 'Failed to create campaign' }, { status: 500 })
      }
    }

    if (type === 'wallet_funding' && userId && amount > 0) {
      try {
        await processWalletFundingWithRetry(
          String(userId),
          referenceCandidates[0] || String(reference),
          Number(amount),
          provider === 'monnify' ? 'monnify' : 'paystack',
          'advertiser',
          3,
          referenceCandidates
        )
        await adminDb.collection('adminNotifications').add({
          type: 'wallet_funding',
          title: 'Wallet funded',
          body: `Advertiser ${userId} funded wallet with â‚¦${amount}`,
          link: '/admin/transactions',
          userId,
          amount,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      } catch (e) {
        console.error('Failed to record wallet funding:', e)
        return NextResponse.json({ success: false, message: 'Failed to record transaction' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Payment processing error:', err)
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
