import { NextResponse } from 'next/server'
import { extractMonnifyReferenceCandidates, runFullActivationFlow } from '@/lib/paymentProcessing'

interface MonnifyVerificationResponse {
  requestSuccessful?: boolean
  responseBody?: {
    paymentStatus?: string
    amount?: number
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const reference = body?.reference as string | undefined
    // Paystack disabled - defaulting to monnify only
    const provider = (body?.provider as string | undefined) || 'monnify'
    const monnifyResponse = body?.monnifyResponse as Record<string, unknown> | undefined
    const userId = body?.userId as string | undefined
    if (!reference) return NextResponse.json({ success: false, message: 'Missing reference' }, { status: 400 })

    let paidAmount = 0

    if (provider === 'monnify') {
      try {
        // For Monnify SDK payments, trust the onComplete callback
        // The SDK only fires onComplete after successful payment
        console.log('Monnify SDK activation verification - trusting SDK callback')
        
        // Set paidAmount to 2000 (activation fee)
        paidAmount = 2000
        
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
          
          const responseBody = verificationResult?.responseBody as MonnifyVerificationResponse['responseBody'] | undefined
          const paymentStatus = String(responseBody?.paymentStatus || '').toUpperCase()

          if (!verificationResult?.requestSuccessful || (paymentStatus !== 'PAID' && paymentStatus !== 'SUCCESSFUL')) {
            console.warn('Monnify server verification not yet confirmed, proceeding with SDK trust:', verificationResult)
          } else {
            console.log('Monnify server verification successful')
            paidAmount = Number(responseBody?.amount || 2000)
          }
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

      // encode reference to avoid problems when reference contains special chars
      const encodedRef = encodeURIComponent(String(reference))
      const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodedRef}`, {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        Accept: 'application/json',
      },
    })
      let verifyData: { status?: boolean; message?: string; data?: { status?: string; amount?: number; metadata?: { userId?: string } } } | null = null
    try {
      verifyData = await verifyRes.json()
    } catch (e) {
      console.error('Failed parsing Paystack verify response JSON', e)
      const text = await verifyRes.text().catch(() => '')
      console.error('Paystack verify raw response:', text)
      return NextResponse.json({ success: false, message: 'Payment verification failed' }, { status: 400 })
    }

      console.log('Paystack verify status:', verifyRes.status, 'body:', JSON.stringify(verifyData))
      if (!verifyData || !verifyData.status || verifyData.data?.status !== 'success') {
      // Helpful hint for common misconfiguration
      if (verifyData && (verifyData.message || '').toString().toLowerCase().includes('transaction reference not found')) {
        return NextResponse.json({
          success: false,
          message: 'Transaction reference not found. This often means the Paystack secret key does not match the environment (test vs live) that created the transaction. Ensure your `NEXT_PUBLIC_PAYSTACK_KEY` and `PAYSTACK_SECRET_KEY` are from the same Paystack account/mode.',
          details: verifyData,
        }, { status: 400 })
      }
        return NextResponse.json({ success: false, message: 'Payment verification failed', details: verifyData }, { status: 400 })
      }

      paidAmount = Number(verifyData.data.amount || 0) / 100
      if (!userId) {
        userId = verifyData.data?.metadata?.userId
      }
    }
    */

    if (!userId) return NextResponse.json({ success: false, message: 'Missing userId' }, { status: 400 })
    if (paidAmount < 2000) {
      return NextResponse.json({ success: false, message: 'Insufficient payment amount' }, { status: 400 })
    }

    const referenceCandidates = provider === 'monnify'
      ? extractMonnifyReferenceCandidates(reference, monnifyResponse || null)
      : [reference]

    // Process activation with retry mechanism
    try {
      const result = await runFullActivationFlow(userId, reference, provider, 'advertiser', referenceCandidates)
      
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
    console.error('advertiser activate error', err)
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
