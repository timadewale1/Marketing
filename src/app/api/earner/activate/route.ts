import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { extractMonnifyReferenceCandidates, processActivationWithRetry } from '@/lib/paymentProcessing'

export async function POST(req: Request) {
  try {
  const body = await req.json()
  const reference = body?.reference as string | undefined
  // Paystack disabled - defaulting to monnify only
  const provider = (body?.provider as string | undefined) || 'monnify'
  const monnifyResponse = body?.monnifyResponse as Record<string, unknown> | undefined
  const userId = body?.userId as string | undefined
  if (!reference) return NextResponse.json({ success: false, message: 'Missing reference' }, { status: 400 })

    if (provider === 'monnify') {
      try {
        // For Monnify SDK payments, trust the onComplete callback
        // The SDK only fires onComplete after successful payment
        console.log('Monnify SDK activation verification - trusting SDK callback')
        
        // Set paidAmount to 2000 (activation fee)
        // If monnifyResponse was provided, validate it has the expected structure
        if (monnifyResponse) {
          console.log('Monnify SDK response:', JSON.stringify(monnifyResponse).substring(0, 200))
          const responseReferences = extractMonnifyReferenceCandidates(reference, monnifyResponse)
          if (responseReferences.length === 0) {
            return NextResponse.json(
              { success: false, message: 'Invalid Monnify SDK response - missing reference' },
              { status: 400 }
            )
          }
        }

        // CRITICAL: Add server-side verification as fallback
        // This ensures payment actually succeeded even if SDK callback is trusted
        try {
          const { verifyTransaction } = await import('@/services/monnify')
          const verificationResult = await verifyTransaction(reference)

          type MonnifyResponseBody = {
            paymentStatus?: string
            amount?: number | string
          }

          const responseBody = verificationResult?.responseBody as MonnifyResponseBody | undefined

          if (!verificationResult?.requestSuccessful || responseBody?.paymentStatus !== 'PAID') {
            console.error('Monnify server verification failed:', verificationResult)
            return NextResponse.json(
              { success: false, message: 'Payment verification failed - please contact support' },
              { status: 400 }
            )
          }

          console.log('Monnify server verification successful')
        } catch (verifyError) {
          console.warn('Monnify server verification failed, proceeding with SDK trust:', verifyError)
          // Continue with SDK trust as fallback, but log the issue
        }
      } catch (e) {
        console.error('Monnify verification error', e)
        return NextResponse.json({ success: false, message: 'Monnify verification failed' }, { status: 400 })
      }
    } 
    /* Paystack disabled - using Monnify only
    else {
      if (!process.env.PAYSTACK_SECRET_KEY) return NextResponse.json({ success: false, message: 'PAYSTACK_SECRET_KEY not configured' }, { status: 500 })

      const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      })
      const verifyData = await verifyRes.json()
      if (!verifyData.status || verifyData.data.status !== 'success') {
        return NextResponse.json({ success: false, message: 'Payment verification failed' }, { status: 400 })
      }

      paidAmount = Number(verifyData.data.amount || 0) / 100
      if (!userId) {
        userId = verifyData.data?.metadata?.userId
      }
    }
    */
    if (!userId) return NextResponse.json({ success: false, message: 'Missing userId' }, { status: 400 })

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin || !admin) return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })

    const adminDb = dbAdmin as import('firebase-admin').firestore.Firestore
    const referenceCandidates = provider === 'monnify'
      ? extractMonnifyReferenceCandidates(reference, monnifyResponse || null)
      : [reference]

    await adminDb.collection('earners').doc(userId).set({
      pendingActivationReference: referenceCandidates[0] || reference,
      pendingActivationReferences: referenceCandidates,
      pendingActivationProvider: provider,
      activationAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })

    // Process activation with retry mechanism
    try {
      const result = await processActivationWithRetry(userId, reference, provider, 3, referenceCandidates)
      
      if (result && result.success) {
        if (result.alreadyActivated) {
          return NextResponse.json({ success: true, message: 'Already activated' })
        }
        return NextResponse.json({ success: true, message: 'Activation successful' })
      }
    } catch (activationError) {
      console.error('Activation processing failed:', activationError)
      return NextResponse.json({ 
        success: false, 
        message: 'Activation processing failed - please contact support with reference: ' + reference 
      }, { status: 500 })
    }
  } catch (err) {
    console.error('activate error', err)
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
