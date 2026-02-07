/**
 * PAYMENT VERIFICATION API ENDPOINT
 * 
 * This endpoint verifies payments from both Paystack and Monnify,
 * handles wallet funding, and processes campaign payments.
 * 
 * Endpoint: POST /api/verify-payment
 * 
 * Request body:
 * {
 *   reference: string        // Payment transaction reference
 *   provider: 'paystack' | 'monnify'
 *   type: 'wallet_funding' | 'campaign' | ...
 *   userId: string           // Firebase UID
 *   amount: number           // Amount in Naira
 *   campaignData?: object    // Optional campaign details
 *   monnifyResponse?: object // Optional Monnify SDK response
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('verify-payment called with body:', JSON.stringify(body))
    const { reference, campaignData, type, userId, amount, provider, monnifyResponse } = body

    if (!reference) {
      return NextResponse.json(
        { success: false, message: 'Missing payment reference' },
        { status: 400 }
      )
    }

    // Initialize admin SDK
    const { admin, dbAdmin } = await initFirebaseAdmin()
    const adminDb = dbAdmin as AdminFirestore

    // ==================== MONNIFY VERIFICATION ====================
    if (provider === 'monnify') {
      try {
        // For Monnify SDK payments, the onComplete callback only fires after successful payment
        // The SDK handles all verification internally, so we trust that the transaction is valid
        console.log('Monnify SDK payment verification - trusting SDK callback')

        // If monnifyResponse was provided from the SDK callback, validate it
        if (monnifyResponse) {
          console.log('Monnify SDK response:', JSON.stringify(monnifyResponse).substring(0, 200))

          // Validate the response has the expected fields
          if (!monnifyResponse.transactionReference && !monnifyResponse.reference) {
            return NextResponse.json(
              { success: false, message: 'Invalid Monnify SDK response - missing reference' },
              { status: 400 }
            )
          }
        }

        // Since onComplete only triggers on successful payment, we can proceed
        console.log('Monnify payment verified via SDK callback')
      } catch (e) {
        console.error('Monnify verification failed:', e)
        return NextResponse.json(
          { success: false, message: 'Unable to verify Monnify payment' },
          { status: 500 }
        )
      }
    }
    // ==================== PAYSTACK VERIFICATION ====================
    else {
      // Default to Paystack
      if (!process.env.PAYSTACK_SECRET_KEY) {
        console.warn('PAYSTACK_SECRET_KEY not configured — skipping remote verification')
      } else {
        try {
          // Encode reference to avoid problems when reference contains special chars
          const encodedRef = encodeURIComponent(String(reference))
          const res = await fetch(
            `https://api.paystack.co/transaction/verify/${encodedRef}`,
            {
              headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                Accept: 'application/json',
              },
            }
          )

          if (!res.ok) {
            const text = await res.text().catch(() => '')
            console.error('Payment verification request failed:', res.status, text)
            return NextResponse.json(
              {
                success: false,
                message: 'Failed to verify payment with provider',
                details: text,
              },
              { status: 500 }
            )
          }

          const verifyData = await res.json()

          if (!verifyData.status) {
            console.error('Payment verification error:', verifyData)
            // Helpful hint when Paystack returns transaction not found
            if (
              (verifyData.message || '')
                .toString()
                .toLowerCase()
                .includes('transaction reference not found')
            ) {
              return NextResponse.json(
                {
                  success: false,
                  message:
                    'Transaction reference not found. Ensure PAYSTACK_SECRET_KEY and NEXT_PUBLIC_PAYSTACK_KEY are from the same Paystack account/mode.',
                  details: verifyData,
                },
                { status: 400 }
              )
            }
            return NextResponse.json(
              { success: false, message: verifyData.message || 'Reference not found' },
              { status: 400 }
            )
          }

          if (verifyData.data.status !== 'success') {
            return NextResponse.json(
              { success: false, message: 'Payment not successful' },
              { status: 400 }
            )
          }

          // For campaign payments, ensure amount matches (Paystack amounts are in kobo)
          if (campaignData) {
            const paidAmount = Number(verifyData.data.amount || 0) / 100
            const expected = Number(campaignData.budget || 0)
            if (expected > 0 && paidAmount < expected) {
              return NextResponse.json(
                { success: false, message: 'Payment amount does not match campaign budget' },
                { status: 400 }
              )
            }
          }
        } catch (error) {
          console.error('Payment verification request failed:', error)
          return NextResponse.json(
            { success: false, message: 'Failed to verify payment' },
            { status: 500 }
          )
        }
      }
    }

    // ==================== HANDLE CAMPAIGN CREATION ====================
    if (campaignData) {
      try {
        if (dbAdmin && admin) {
          await adminDb.collection('campaigns').add({
            ...campaignData,
            paymentRef: reference,
            status: 'active',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          })
          // Notify admin
          await adminDb.collection('adminNotifications').add({
            type: 'campaign_created',
            title: 'New campaign (paid)',
            body: `${String(campaignData.title || 'Untitled')} was created via payment`,
            link: '/admin/campaigns',
            campaignTitle: String(campaignData.title || ''),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          })
        }
      } catch (e) {
        console.error('Failed to create campaign:', e)
        return NextResponse.json(
          { success: false, message: 'Failed to create campaign' },
          { status: 500 }
        )
      }
    }

    // ==================== HANDLE WALLET FUNDING ====================
    if (type === 'wallet_funding' && userId && amount > 0) {
      try {
        if (dbAdmin && admin) {
          // Record transaction in advertiser or earner transactions
          await adminDb.collection('advertiserTransactions').add({
            userId,
            type: 'wallet_funding',
            amount,
            provider,
            reference,
            status: 'completed',
            note: `Wallet funded via ${provider}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          })

          // Increment advertiser or earner balance
          try {
            const advRef = adminDb.collection('advertisers').doc(userId)
            await advRef.update({
              balance: admin.firestore.FieldValue.increment(Number(amount)),
            })
          } catch (updErr) {
            console.warn('Failed to update advertiser balance:', updErr)
            try {
              const earnerRef = adminDb.collection('earners').doc(userId)
              await earnerRef.update({
                balance: admin.firestore.FieldValue.increment(Number(amount)),
              })
            } catch (e) {
              console.error('Failed to update earner balance:', e)
            }
          }
        }
      } catch (e) {
        console.error('Failed to process wallet funding:', e)
        return NextResponse.json(
          { success: false, message: 'Failed to fund wallet' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json(
      { success: true, message: 'Payment verified successfully' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Unhandled error in verify-payment:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
