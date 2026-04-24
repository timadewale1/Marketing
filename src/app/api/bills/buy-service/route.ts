import { NextRequest, NextResponse } from 'next/server'
import vtpassClient from '@/services/vtpass/client'
import * as paystack from '@/services/paystack'
import * as monnify from '@/services/monnify'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { generateRequestId } from '@/services/vtpass/utils'
import { getVariations } from '@/services/vtpass/serviceApi'
import { notifyAdminOfBillsPurchase } from '@/lib/bills-admin-alerts'
import { resolveActorUserIdFromRequest, verifyExternalBillsPayment } from '@/lib/bills-payment'

const FRIENDLY_PROVIDER_ERROR_MESSAGE = 'This service is temporarily unavailable right now. Please try again later.'
const FRIENDLY_REFUND_PENDING_MESSAGE = 'We could not complete this payment. If you were charged, your refund will be processed shortly.'

function normalizeVariation(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

async function validateSelectedVariation(serviceID: string, variationCode?: string | null) {
  if (!variationCode) return

  const variations = await getVariations(serviceID)
  const wanted = normalizeVariation(variationCode)
  const matched = Array.isArray(variations) && variations.some((item) => {
    const record = item as Record<string, unknown>
    return normalizeVariation(record.variation_code) === wanted || normalizeVariation(record.code) === wanted
  })

  if (!matched) {
    throw new Error('Selected variation unavailable')
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { request_id, serviceID, amount, phone, paystackReference, userId, metadata, variation_code, billersCode, subscription_type, quantity, provider } = body || {}
    let actorUserId: string | undefined = userId || await resolveActorUserIdFromRequest(req)

    if (!serviceID) return NextResponse.json({ ok: false, message: 'serviceID is required' }, { status: 400 })

    const reqId = request_id || generateRequestId(String(Math.floor(Math.random() * 1000000)))

    const payload: Record<string, unknown> = { request_id: reqId, serviceID }
    if (variation_code) payload.variation_code = variation_code
    if (billersCode) payload.billersCode = billersCode
    if (subscription_type) payload.subscription_type = subscription_type
    if (quantity) payload.quantity = quantity
    if (phone) payload.phone = phone
    if (amount) payload.amount = String(amount)
    if (metadata) payload.metadata = metadata
    try {
      await validateSelectedVariation(String(serviceID), variation_code ? String(variation_code) : null)
    } catch (error) {
      console.error('Bills variation validation failed', error)
      return NextResponse.json({ ok: false, message: 'This plan is currently unavailable. Please refresh and try again.' }, { status: 400 })
    }

    // Wallet payment flow: if `payFromWallet` is set in the body, reserve funds
    // from the user's wallet (advertiser or earner) and then call VTpass. If
    // VTpass fails we restore the reserved funds and mark the transaction failed.
    const { payFromWallet } = body || {}
    if (payFromWallet) {
      const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ ok: false, message: 'Missing Authorization token' }, { status: 401 })
      }
      const idToken = authHeader.split('Bearer ')[1]

      const { admin, dbAdmin } = await initFirebaseAdmin()
      if (!admin || !dbAdmin) return NextResponse.json({ ok: false, message: 'Server admin unavailable' }, { status: 500 })

      let verifiedUid: string
      try {
        const decoded = await admin.auth().verifyIdToken(idToken)
        verifiedUid = decoded.uid
      } catch (err) {
        console.error('Invalid ID token', err)
        return NextResponse.json({ ok: false, message: 'Invalid ID token' }, { status: 401 })
      }

      const db = dbAdmin as import('firebase-admin').firestore.Firestore
      actorUserId = verifiedUid
      const amountN = Number(payload.amount || 0)
      if (!amountN || amountN <= 0) return NextResponse.json({ ok: false, message: 'Invalid amount' }, { status: 400 })

      const advertiserRef = db.collection('advertisers').doc(verifiedUid)
      const earnerRef = db.collection('earners').doc(verifiedUid)
      const advSnap = await advertiserRef.get()
      const earSnap = await earnerRef.get()
      let userType: 'advertiser' | 'earner' | null = null
      let userRef: import('firebase-admin').firestore.DocumentReference
      let txCollection = ''
      if (advSnap.exists) { userType = 'advertiser'; userRef = advertiserRef; txCollection = 'advertiserTransactions' }
      else if (earSnap.exists) { userType = 'earner'; userRef = earnerRef; txCollection = 'earnerTransactions' }
      else {
        return NextResponse.json({ ok: false, message: 'User wallet not found' }, { status: 404 })
      }

      if (userType === 'earner' && !earSnap.data()?.activated) {
        return NextResponse.json(
          {
            ok: false,
            message: 'Your first N2,000 earned will be used to activate your account automatically before wallet spending is allowed.',
          },
          { status: 400 }
        )
      }

      const txDocRef = db.collection(txCollection).doc()
      try {
        await db.runTransaction(async (t) => {
          const uSnap = await t.get(userRef)
          const bal = Number(uSnap.data()?.balance || 0)
          if (bal < amountN) throw new Error('Insufficient balance')

          t.update(userRef, { balance: admin.firestore.FieldValue.increment(-amountN) })
          t.set(txDocRef, {
            userId: verifiedUid,
            type: 'vtpass_purchase',
            amount: -amountN,
            status: 'pending',
            request_id: reqId,
            serviceID: serviceID || null,
            phone: phone || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          })
        })
      } catch (e: unknown) {
        const msg = (e instanceof Error && e.message) || 'Insufficient funds'
        const status = msg.includes('Insufficient') ? 402 : 500
        return NextResponse.json({ ok: false, message: msg }, { status })
      }

      // Call VTpass now that funds are reserved
      try {
        const vtRes2 = await vtpassClient.post('/pay', payload)
        const vtData2 = vtRes2?.data
        const vtCode2 = vtData2?.code
        if (vtCode2 && String(vtCode2) !== '000') {
          try { await db.collection(txCollection).doc(txDocRef.id).update({ status: 'failed', response: vtData2, updatedAt: new Date().toISOString() }) } catch {}
          try { await db.collection(userType === 'advertiser' ? 'advertisers' : 'earners').doc(verifiedUid).update({ balance: admin.firestore.FieldValue.increment(amountN) }) } catch (e) { console.error('Failed to restore balance', e) }
          return NextResponse.json({ ok: false, message: FRIENDLY_PROVIDER_ERROR_MESSAGE }, { status: 400 })
        }

        try { await db.collection(txCollection).doc(txDocRef.id).update({ status: 'completed', response: vtData2, updatedAt: new Date().toISOString() }) } catch (e) { console.warn('Failed to update tx', e) }
        await notifyAdminOfBillsPurchase({
          actorUserId: verifiedUid,
          paidAmount: amountN,
          serviceID,
          paymentChannel: 'wallet',
          reference: reqId,
        })

        return NextResponse.json({ ok: true, result: vtData2 })
      } catch (e) {
        console.error('VTpass call after wallet reserve failed', e)
        try { await db.collection(txCollection).doc(txDocRef.id).update({ status: 'failed', error: String(e), updatedAt: new Date().toISOString() }) } catch {}
        try { await db.collection(userType === 'advertiser' ? 'advertisers' : 'earners').doc(verifiedUid).update({ balance: admin.firestore.FieldValue.increment(amountN) }) } catch (err) { console.error('Failed to restore balance', err) }
        return NextResponse.json({ ok: false, message: FRIENDLY_PROVIDER_ERROR_MESSAGE }, { status: 500 })
      }
    }

    if (process.env.PAYSTACK_SECRET_KEY && provider === 'paystack') {
      if (!paystackReference) return NextResponse.json({ ok: false, message: 'Missing payment reference. Please complete payment via Paystack first.' }, { status: 400 })
      try {
        const verification = await verifyExternalBillsPayment({
          provider,
          reference: paystackReference,
          expectedAmount: Number(amount || payload.amount || 0),
        })
        payload.paystackVerificationData = verification.verificationData
      } catch (e) {
        console.error('Paystack verification error', e)
        return NextResponse.json({ ok: false, message: 'Failed to verify payment' }, { status: 500 })
      }
    }

    // Handle Monnify verification similarly
    if (process.env.MONNIFY_API_KEY && provider === 'monnify') {
      if (!paystackReference) return NextResponse.json({ ok: false, message: 'Missing payment reference. Please complete payment via Monnify first.' }, { status: 400 })
      try {
        const verification = await verifyExternalBillsPayment({
          provider,
          reference: paystackReference,
          expectedAmount: Number(amount || payload.amount || 0),
        })
        payload.monnifyVerificationData = verification.verificationData
      } catch (e) {
        console.error('Monnify verification error', e)
        return NextResponse.json({ ok: false, message: 'Failed to verify payment' }, { status: 500 })
      }
    }

    const vtRes = await vtpassClient.post('/pay', payload)
    const vtData = vtRes?.data
    // Determine amounts from request or VTpass response
    // Use the service price only (no service charge markup)
    const recordedAmount = Number(amount ?? (vtData?.amount ?? vtData?.content?.amount ?? 0))
    const paidAmount = Number(recordedAmount || 0)
    const markup = 0

    // If VTpass returns a non-success code, surface as failure to client
    const vtCode = vtData?.code
    if (vtCode && String(vtCode) !== '000') {
      const providerMessage = vtData?.response_description || vtData?.content || 'Service currently unavailable'
      
      // Attempt automatic refund if payment was made
      let refundStatus = 'none'
      let refundError: string | null = null
      
      if (provider === 'paystack' && paystackReference) {
        try {
          console.log(`[REFUND] Initiating Paystack refund for reference: ${paystackReference}`)
          const paystackVerifyData = (payload as Record<string, unknown>).paystackVerificationData as Record<string, unknown> | undefined
          const amountKobo = Number((paystackVerifyData as Record<string, unknown>)?.amount || (Number(amount) * 100))
          await paystack.refundTransaction({
            transactionRef: paystackReference,
            amountKobo: amountKobo,
            reason: `Bill payment failed for ${serviceID}: ${providerMessage}. Automatic refund.`
          })
          refundStatus = 'initiated'
          console.log(`[REFUND] Paystack refund successfully initiated`)
        } catch (refundErr) {
          refundStatus = 'failed'
          refundError = refundErr instanceof Error ? refundErr.message : String(refundErr)
          console.error(`[REFUND] Paystack refund failed: ${refundError}`)
        }
      }
      
      if (provider === 'monnify' && paystackReference) {
        try {
          console.log(`[REFUND] Initiating Monnify refund for reference: ${paystackReference}`)
          const monnifyVerifyData = (payload as Record<string, unknown>).monnifyVerificationData as Record<string, unknown> | undefined
          const amountPaid = typeof monnifyVerifyData === 'object' && monnifyVerifyData !== null && 'amountPaid' in monnifyVerifyData ? Number(monnifyVerifyData.amountPaid) : 0
          const refundAmount = amountPaid > 0 ? amountPaid : Number(amount)
          await monnify.refundTransaction({
            transactionRef: paystackReference,
            amount: refundAmount,
            refundReference: `bill-refund-${reqId}`,
            customerNote: 'Bill refund',
            reason: `Bill payment failed for ${serviceID}: ${providerMessage}. Automatic refund.`
          })
          refundStatus = 'initiated'
          console.log(`[REFUND] Monnify refund successfully initiated`)
        } catch (refundErr) {
          refundStatus = 'failed'
          refundError = refundErr instanceof Error ? refundErr.message : String(refundErr)
          console.error(`[REFUND] Monnify refund failed: ${refundError}`)
        }
      }
      
      try {
        const { dbAdmin } = await initFirebaseAdmin()
        if (dbAdmin) {
          await dbAdmin.collection('vtpassTransactions').add({
            request_id: reqId,
            serviceID,
            variation_code: variation_code || null,
            billersCode: billersCode || null,
            amount: recordedAmount || null,
            paidAmount,
            markup,
            phone: phone || null,
            paystackReference: paystackReference || null,
            provider: provider || null,
            response: vtRes.data || null,
            userId: actorUserId || null,
            vtpassFailed: true,
            providerMessage: providerMessage,
            refundStatus: refundStatus,
            refundError: refundError,
            createdAt: new Date().toISOString(),
          })
        }
      } catch (error) {
        console.warn('Failed to save transaction', error)
      }
      
      const errorMsg = refundStatus === 'initiated'
        ? FRIENDLY_REFUND_PENDING_MESSAGE
        : refundStatus === 'failed'
          ? 'We could not complete this payment. Please contact support if you were charged.'
          : FRIENDLY_PROVIDER_ERROR_MESSAGE
      
      return NextResponse.json({ ok: false, message: errorMsg, refundStatus }, { status: 400 })
    }

    try {
      const { dbAdmin } = await initFirebaseAdmin()
      if (dbAdmin) {
        await dbAdmin.collection('vtpassTransactions').add({
          request_id: reqId,
          serviceID,
          variation_code: variation_code || null,
          billersCode: billersCode || null,
          amount: recordedAmount || null,
          paidAmount,
          markup,
          phone: phone || null,
          paystackReference: paystackReference || null,
          response: vtRes.data || null,
          userId: userId || null,
          createdAt: new Date().toISOString(),
        })
      }
      // If caller provided an Authorization token, also create a user-facing transaction
      try {
        const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const idToken = authHeader.split('Bearer ')[1]
          const { admin, dbAdmin: dbAdminInstance } = await initFirebaseAdmin()
          if (admin && dbAdminInstance) {
            try {
              const decoded = await admin.auth().verifyIdToken(idToken)
              const uid = decoded.uid
              const advertiserRef = dbAdminInstance.collection('advertisers').doc(uid)
              const earnerRef = dbAdminInstance.collection('earners').doc(uid)
              const advSnap = await advertiserRef.get()
              const earSnap = await earnerRef.get()
              let txCollection = ''
              if (advSnap.exists) txCollection = 'advertiserTransactions'
              else if (earSnap.exists) txCollection = 'earnerTransactions'
              if (txCollection) {
                try {
                  await dbAdminInstance.collection(txCollection).add({
                    userId: uid,
                    type: 'vtpass_purchase',
                    amount: -Math.abs(paidAmount || 0),
                    status: 'completed',
                    request_id: reqId,
                    serviceID: serviceID || null,
                    phone: phone || null,
                    paystackReference: paystackReference || null,
                    createdAt: new Date().toISOString(),
                    response: vtRes.data || null,
                  })
                } catch (e) {
                  console.warn('Failed to create user tx for vtpass purchase', e)
                }
              }
            } catch {
              // ignore token verification errors for non-authenticated requests
            }
          }
        }
      } catch (e) {
        console.warn('Error creating user transaction', e)
      }
    } catch (e) {
      console.warn('Failed to save transaction', e)
    }

    await notifyAdminOfBillsPurchase({
      actorUserId,
      paidAmount,
      serviceID,
      paymentChannel: provider === 'monnify' || provider === 'paystack' ? provider : 'direct',
      reference: String(paystackReference || reqId),
    })

    /*
    if (false && actorUserId) {
      try {
        const { dbAdmin } = await initFirebaseAdmin()
        let adminProfilePath = `/admin/earners/${actorUserId}`
        let actorName = 'User'
        if (dbAdmin) {
          const advSnap = await dbAdmin.collection('advertisers').doc(String(actorUserId)).get()
          if (advSnap.exists) {
            const advData = advSnap.data() as { fullName?: string; name?: string; businessName?: string; companyName?: string }
            actorName = String(advData.fullName || advData.name || advData.businessName || advData.companyName || 'Advertiser').trim()
            adminProfilePath = `/admin/advertisers/${actorUserId}`
          } else {
            const earnerSnap = await dbAdmin.collection('earners').doc(String(actorUserId)).get()
            if (earnerSnap.exists) {
              const earnerData = earnerSnap.data() as { fullName?: string; name?: string }
              actorName = String(earnerData.fullName || earnerData.name || 'Earner').trim()
            }
          }
        }
        sendAdminActionEmail({
          subject: `Bills purchase - ₦${paidAmount.toLocaleString()}`,
          title: 'Bills purchase completed',
          message: `${actorName} completed a bills purchase for service ${serviceID} (₦${paidAmount.toLocaleString()}).`,
          adminPath: adminProfilePath,
        }).catch((error) => {
          console.error('Failed to send admin bills email', error)
        })
      } catch (error) {
        console.warn('Failed to resolve bills purchase user type', error)
      }
    }
    */

    return NextResponse.json({ ok: true, result: vtRes.data })
  } catch (err: unknown) {
    console.error('bills buy-service error', err)
    const message = 'Unable to process this bill payment right now. Please try again later.'
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}
