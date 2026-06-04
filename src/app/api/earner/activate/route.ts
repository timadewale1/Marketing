import { NextResponse } from 'next/server'
import { extractMonnifyReferenceCandidates, runFullActivationFlow } from '@/lib/paymentProcessing'
import { confirmMonnifyPaymentWithRetries, isMonnifyImmediateSuccessResponse } from '@/lib/monnify-confirmation'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { logPaymentLifecycle } from '@/lib/payment-reconciliation'

// Fast activation lane: keep trying for just under 5 minutes so fresh successful
// payments can settle without falling back to the slower background recovery.
const ACTIVATION_CONFIRMATION_RETRY_DELAYS_MS = [0, 2000, 5000, 10000, 20000, 40000, 60000, 150000]

export async function POST(req: Request) {
  try {
  const body = await req.json()
  const reference = body?.reference as string | undefined
  // Paystack disabled - defaulting to monnify only
  const provider = (body?.provider as string | undefined) || 'monnify'
  const monnifyResponse = body?.monnifyResponse as Record<string, unknown> | undefined
  const userId = body?.userId as string | undefined
  if (!reference) return NextResponse.json({ success: false, message: 'Missing reference' }, { status: 400 })
  if (!userId) return NextResponse.json({ success: false, message: 'Missing userId' }, { status: 400 })
  let referenceCandidates = provider === 'monnify'
    ? extractMonnifyReferenceCandidates(reference, monnifyResponse || null)
    : [reference]
  let monnifyConfirmation: Awaited<ReturnType<typeof confirmMonnifyPaymentWithRetries>> | null = null
  let paidAmount = 0
  const monnifyImmediateSuccess = provider === 'monnify' && Boolean(monnifyResponse) && isMonnifyImmediateSuccessResponse(monnifyResponse)

    if (provider === 'monnify') {
      await logPaymentLifecycle({
        scope: 'activation',
        status: 'callback_received',
        source: 'earner/activate',
        provider,
        role: 'earner',
        userId: userId || null,
        reference,
        references: referenceCandidates,
        amount: 2000,
      })
      try {
        const { admin, dbAdmin } = await initFirebaseAdmin()
        if (!admin || !dbAdmin) {
          return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })
        }

        await dbAdmin.collection('earners').doc(userId).set({
          pendingActivationReference: referenceCandidates[0] || reference,
          pendingActivationReferences: admin.firestore.FieldValue.arrayUnion(...referenceCandidates),
          pendingActivationProvider: 'monnify',
          activationAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true })

        await dbAdmin.collection('activationAttempts').doc(`earner_${userId}`).set({
          reference: referenceCandidates[0] || reference,
          references: admin.firestore.FieldValue.arrayUnion(...referenceCandidates),
          status: 'pending',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          recoveryRetryCount: 0,
          lastRecoveryCheckedAt: admin.firestore.FieldValue.delete(),
          lastRecoveryVerificationState: admin.firestore.FieldValue.delete(),
          nextRecoveryCheckAt: admin.firestore.FieldValue.delete(),
          recoveryDisposition: admin.firestore.FieldValue.delete(),
          recoveryEscalatedAt: admin.firestore.FieldValue.delete(),
          recoveryEscalationReason: admin.firestore.FieldValue.delete(),
          recoveryAutoChecksLocked: admin.firestore.FieldValue.delete(),
        }, { merge: true })

        // For Monnify SDK payments, trust the onComplete callback
        // The SDK only fires onComplete after successful payment
        console.log('Monnify SDK activation verification - trusting SDK callback')
        
        // Set paidAmount to 2000 (membership fee)
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

        try {
          if (monnifyImmediateSuccess) {
            monnifyConfirmation = {
              confirmed: true,
              references: referenceCandidates,
              paymentStatus: 'PAID',
              verificationResult: null,
            }
            paidAmount = Number((monnifyResponse as { responseBody?: { amount?: number }; data?: { amount?: number } } | undefined)?.responseBody?.amount || (monnifyResponse as { responseBody?: { amount?: number }; data?: { amount?: number } } | undefined)?.data?.amount || 2000)
            console.log('Monnify SDK reported immediate success, activating without waiting for retry window')
          } else {
            monnifyConfirmation = await confirmMonnifyPaymentWithRetries(
              reference,
              referenceCandidates,
              ACTIVATION_CONFIRMATION_RETRY_DELAYS_MS
            )
            referenceCandidates = monnifyConfirmation.references
            if (!monnifyConfirmation.confirmed) {
              console.warn('Monnify server verification not yet confirmed, keeping activation pending:', monnifyConfirmation.paymentStatus)
            } else {
              console.log('Monnify server verification successful')
              const responseBody = monnifyConfirmation.verificationResult?.responseBody as { amount?: number } | undefined
              paidAmount = Number(responseBody?.amount || 2000)
            }
          }
        } catch (verifyError) {
          console.warn('Monnify server verification failed, keeping activation pending:', verifyError)
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
    if (provider === 'monnify') {
      const confirmation = monnifyConfirmation || await confirmMonnifyPaymentWithRetries(
        reference,
        referenceCandidates,
        ACTIVATION_CONFIRMATION_RETRY_DELAYS_MS
      )
      referenceCandidates = confirmation.references

      if (!confirmation.confirmed) {
        await logPaymentLifecycle({
          scope: 'activation',
          status: 'pending_confirmation',
          source: 'earner/activate',
          provider,
          role: 'earner',
          userId,
          reference,
          references: referenceCandidates,
          amount: 2000,
          details: { paymentStatus: confirmation.paymentStatus || null },
        })
        return NextResponse.json({
          success: true,
          completed: false,
          pendingConfirmation: true,
          message: 'Payment received. Awaiting Monnify confirmation.',
          references: referenceCandidates,
        })
      }
    }

    // Process activation with retry mechanism
    try {
      const result = await runFullActivationFlow(userId, reference, provider, 'earner', referenceCandidates, paidAmount)
      
      if (result && result.success) {
        await logPaymentLifecycle({
          scope: 'activation',
          status: result.alreadyActivated ? 'matched' : 'completed',
          source: 'earner/activate',
          provider,
          role: 'earner',
          userId,
          reference,
          references: referenceCandidates,
          amount: 2000,
        })
        if (result.alreadyActivated) {
          return NextResponse.json({ success: true, completed: true, message: 'Membership already confirmed' })
        }
        return NextResponse.json({ success: true, completed: true, message: 'Membership fee confirmed successfully' })
      }
    } catch (activationError) {
      console.error('Activation processing failed:', activationError)
      await logPaymentLifecycle({
        scope: 'activation',
        status: 'failed',
        source: 'earner/activate',
        provider,
        role: 'earner',
        userId,
        reference,
        references: referenceCandidates,
        amount: 2000,
        details: { message: activationError instanceof Error ? activationError.message : String(activationError) },
      })
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
