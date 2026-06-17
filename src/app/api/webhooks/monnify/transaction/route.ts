import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getActivationAttemptDocId } from '@/lib/activation-attempts'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { extractMonnifyReferenceCandidates, processActivationWithRetry, processWalletFundingWithRetry } from '@/lib/paymentProcessing'
import { logPaymentLifecycle } from '@/lib/payment-reconciliation'

/**
 * Monnify Transaction Webhook Handler
 * Receives transaction/payment completion notifications
 * 
 * Webhook events:
 * - SUCCESSFUL: Payment completed successfully
 * - FAILED: Payment failed
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

async function findActivationUserByReferences(
  dbAdmin: NonNullable<Awaited<ReturnType<typeof initFirebaseAdmin>>['dbAdmin']>,
  collectionName: 'advertisers' | 'earners',
  references: string[]
) {
  const primaryReference = references[0]
  if (!primaryReference) return null

  const snap = await dbAdmin.collection(collectionName)
    .where('pendingActivationReference', '==', primaryReference)
    .limit(1)
    .get()

  if (!snap.empty) return snap.docs[0]

  return null
}

async function findPendingWalletTransactionByReferences(
  dbAdmin: NonNullable<Awaited<ReturnType<typeof initFirebaseAdmin>>['dbAdmin']>,
  collectionName: 'advertiserTransactions' | 'earnerTransactions',
  references: string[]
) {
  for (const reference of references) {
    const snap = await dbAdmin.collection(collectionName)
      .where('reference', '==', reference)
      .where('type', '==', 'wallet_funding')
      .where('status', '==', 'pending')
      .limit(1)
      .get()

    if (!snap.empty) {
      return snap.docs[0]
    }
  }

  return null
}

async function findActivationAttemptByReferences(
  dbAdmin: NonNullable<Awaited<ReturnType<typeof initFirebaseAdmin>>['dbAdmin']>,
  references: string[]
) {
  const primaryReference = references[0]
  if (!primaryReference) return null

  const snap = await dbAdmin.collection('activationAttempts')
    .where('reference', '==', primaryReference)
    .limit(1)
    .get()

  if (!snap.empty && String(snap.docs[0].data()?.status || '').toLowerCase() !== 'completed') {
    return snap.docs[0]
  }

  return null
}

function normalizeWebhookText(value: unknown) {
  return String(value || '').trim().toUpperCase()
}

function toSafeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isSuccessfulMonnifyCollection(eventType: unknown, eventData: Record<string, unknown> | null | undefined) {
  const normalizedEventType = normalizeWebhookText(eventType)
  const paymentStatus = normalizeWebhookText(eventData?.paymentStatus || eventData?.status)

  return (
    normalizedEventType === 'SUCCESSFUL_TRANSACTION' ||
    normalizedEventType === 'TRANSACTION_COMPLETION' ||
    paymentStatus === 'PAID' ||
    paymentStatus === 'SUCCESS' ||
    paymentStatus === 'SUCCESSFUL' ||
    paymentStatus === 'COMPLETED'
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const signature = req.headers.get('monnify-signature')
    const secret = process.env.MONNIFY_SECRET_KEY!

    if (!verifyMonnifyWebhookSignature(body, signature, secret)) {
      console.warn('[webhook][monnify][transaction] Invalid signature')
      return NextResponse.json({ success: false, message: 'Invalid signature' }, { status: 401 })
    }

    const payload = JSON.parse(body)
    const eventType = payload.eventType
    const eventData = payload.eventData || {}
    const normalizedEventType = normalizeWebhookText(eventType)
    console.log('[webhook][monnify][transaction] received event', {
      eventType: normalizedEventType,
      reference: eventData?.reference,
      status: eventData?.status || eventData?.paymentStatus,
    })

    // Initialize Firebase admin for processing
    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin || !admin) {
      console.error('[webhook][monnify][transaction] Firebase admin not initialized')
      return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
    }

    if (isSuccessfulMonnifyCollection(eventType, eventData)) {
      const { reference, status, amount, transactionReference } = eventData
      const rawAmount = eventData?.amount ?? eventData?.amountPaid ?? eventData?.paidAmount ?? eventData?.totalPayable
      const safeAmount = toSafeNumber(rawAmount, 0)
      const effectiveReference = String(reference || transactionReference || '')
      const paymentStatus = normalizeWebhookText(eventData?.paymentStatus || status)
      const customerEmail = String(
        (eventData?.customer && typeof eventData.customer === 'object'
          ? (eventData.customer as Record<string, unknown>).email
          : '') || ''
      ).trim().toLowerCase()
      const referenceCandidates = extractMonnifyReferenceCandidates(
        effectiveReference,
        eventData as Record<string, unknown>,
        typeof transactionReference === 'string' ? transactionReference : null
      )

      console.log('[webhook][monnify][transaction] processing transaction', {
        reference: effectiveReference,
        transactionReference,
        paymentStatus,
        status,
        amount: safeAmount,
        rawAmount,
      })
      await logPaymentLifecycle({
        scope: safeAmount >= 2000 ? 'activation' : 'wallet_funding',
        status: 'webhook_received',
        source: 'webhooks/monnify/transaction',
        provider: 'monnify',
        email: customerEmail,
        reference: effectiveReference,
        references: referenceCandidates,
        amount: safeAmount,
        details: { webhookStatus: String(status || ''), eventType: String(eventType || '') },
      })

      // Handle transaction completion - process activation and wallet funding
      if (paymentStatus === 'PAID' || paymentStatus === 'SUCCESSFUL' || paymentStatus === 'SUCCESS' || paymentStatus === 'COMPLETED') {
        try {
          // Check if already processed (idempotency)
          for (const candidateReference of referenceCandidates) {
            const processedSnap = await dbAdmin.collection('processedWebhooks')
              .where('reference', '==', candidateReference)
              .where('eventType', '==', 'TRANSACTION_COMPLETION')
              .limit(1)
              .get()

            if (!processedSnap.empty) {
              console.log('[webhook][monnify][transaction] already processed, skipping:', candidateReference)
              return NextResponse.json({ success: true, message: 'Already processed' })
            }
          }

          // Mark as processing to prevent concurrent processing
          await dbAdmin.collection('processedWebhooks').doc().set({
            reference: referenceCandidates[0] || effectiveReference,
            referenceCandidates,
            eventType: 'TRANSACTION_COMPLETION',
            sourceEventType: normalizedEventType,
            status: paymentStatus || normalizeWebhookText(status) || null,
            paymentStatus: paymentStatus || null,
            amount: safeAmount,
            transactionReference: transactionReference || null,
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
          })
          // Check if this is a wallet funding transaction (advertiser first, then earner)
          const walletTxDoc = await findPendingWalletTransactionByReferences(
            dbAdmin,
            'advertiserTransactions',
            referenceCandidates
          )

          if (walletTxDoc) {
            const txData = walletTxDoc.data()

            console.log('[webhook][monnify][transaction] processing wallet funding for', txData.userId)

            try {
              await processWalletFundingWithRetry(
                txData.userId,
                String(txData.reference || referenceCandidates[0] || reference || ''),
                Number(txData.amount || 0),
                'monnify',
                'advertiser',
                3,
                referenceCandidates
              )
              await logPaymentLifecycle({
                scope: 'wallet_funding',
                status: 'webhook_processed',
                source: 'webhooks/monnify/transaction',
                provider: 'monnify',
                role: 'advertiser',
                userId: String(txData.userId || ''),
                email: customerEmail,
                reference: String(txData.reference || referenceCandidates[0] || reference || ''),
                  references: referenceCandidates,
                  amount: Number(txData.amount || 0),
                  transactionId: walletTxDoc.id,
                })
                console.log('[webhook][monnify][transaction] wallet funding processed successfully')
            } catch (fundingError) {
              console.error('[webhook][monnify][transaction] wallet funding failed:', fundingError)
            }
          } else {
            const earnerTxDoc = await findPendingWalletTransactionByReferences(
              dbAdmin,
              'earnerTransactions',
              referenceCandidates
            )

            if (earnerTxDoc) {
              const txData = earnerTxDoc.data()

              console.log('[webhook][monnify][transaction] processing earner wallet funding for', txData.userId)

              try {
                await processWalletFundingWithRetry(
                  txData.userId,
                  String(txData.reference || referenceCandidates[0] || reference || ''),
                  Number(txData.amount || 0),
                  'monnify',
                  'earner',
                  3,
                  referenceCandidates
                )
                await logPaymentLifecycle({
                  scope: 'wallet_funding',
                  status: 'webhook_processed',
                  source: 'webhooks/monnify/transaction',
                  provider: 'monnify',
                  role: 'earner',
                  userId: String(txData.userId || ''),
                  email: customerEmail,
                  reference: String(txData.reference || referenceCandidates[0] || reference || ''),
                  references: referenceCandidates,
                  amount: Number(txData.amount || 0),
                  transactionId: earnerTxDoc.id,
                })
                console.log('[webhook][monnify][transaction] earner wallet funding processed successfully')
              } catch (fundingError) {
                console.error('[webhook][monnify][transaction] earner wallet funding failed:', fundingError)
              }
            } else {
              // Check if this is an activation payment (advertiser first, then earner)
              const advertiserDoc = await findActivationUserByReferences(dbAdmin, 'advertisers', referenceCandidates)

              if (advertiserDoc) {
                console.log('[webhook][monnify][transaction] processing activation for advertiser', advertiserDoc.id)

                try {
                    await processActivationWithRetry(advertiserDoc.id, referenceCandidates[0] || String(reference || ''), 'monnify', 3, referenceCandidates, safeAmount > 0 ? safeAmount : 2000)
                    await logPaymentLifecycle({
                      scope: 'activation',
                      status: 'webhook_processed',
                      source: 'webhooks/monnify/transaction',
                      provider: 'monnify',
                      role: 'advertiser',
                      userId: advertiserDoc.id,
                      email: customerEmail,
                      reference: referenceCandidates[0] || String(reference || ''),
                      references: referenceCandidates,
                      amount: safeAmount,
                    })
                    console.log('[webhook][monnify][transaction] activation processed successfully')
                } catch (activationError) {
                  console.error('[webhook][monnify][transaction] activation failed:', activationError)
                }
              } else {
                const earnerDoc = await findActivationUserByReferences(dbAdmin, 'earners', referenceCandidates)

                if (earnerDoc) {
                  console.log('[webhook][monnify][transaction] processing activation for earner', earnerDoc.id)

                  try {
                    await processActivationWithRetry(earnerDoc.id, referenceCandidates[0] || String(reference || ''), 'monnify', 3, referenceCandidates, safeAmount > 0 ? safeAmount : 2000)
                    await logPaymentLifecycle({
                      scope: 'activation',
                      status: 'webhook_processed',
                      source: 'webhooks/monnify/transaction',
                      provider: 'monnify',
                      role: 'earner',
                      userId: earnerDoc.id,
                      email: customerEmail,
                      reference: referenceCandidates[0] || String(reference || ''),
                      references: referenceCandidates,
                      amount: safeAmount,
                    })
                    console.log('[webhook][monnify][transaction] activation processed successfully')
                  } catch (activationError) {
                    console.error('[webhook][monnify][transaction] activation failed:', activationError)
                  }
                } else {
                  const activationAttemptDoc = await findActivationAttemptByReferences(dbAdmin, referenceCandidates)

                  if (activationAttemptDoc) {
                    const attemptData = activationAttemptDoc.data()
                    const attemptedRole = String(attemptData.role || '') === 'advertiser' ? 'advertiser' : 'earner'
                    const attemptedUserId = String(attemptData.userId || '')
                    if (attemptedUserId) {
                      console.log('[webhook][monnify][transaction] processing activation from attempt record', {
                        userId: attemptedUserId,
                        role: attemptedRole,
                        attemptId: activationAttemptDoc.id,
                      })

                      try {
                        await processActivationWithRetry(
                          attemptedUserId,
                          referenceCandidates[0] || String(reference || ''),
                          'monnify',
                          3,
                          referenceCandidates,
                          safeAmount > 0 ? safeAmount : 2000
                        )

                        await dbAdmin.collection('activationAttempts').doc(getActivationAttemptDocId(attemptedRole, attemptedUserId)).set({
                          reference: referenceCandidates[0] || String(reference || ''),
                          references: admin.firestore.FieldValue.arrayUnion(...referenceCandidates),
                          status: 'completed',
                          pendingReference: admin.firestore.FieldValue.delete(),
                          completedReference: referenceCandidates[0] || String(reference || ''),
                          completedAt: admin.firestore.FieldValue.serverTimestamp(),
                          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        }, { merge: true })
                        await logPaymentLifecycle({
                          scope: 'activation',
                          status: 'matched',
                          source: 'webhooks/monnify/transaction',
                          provider: 'monnify',
                          role: attemptedRole,
                          userId: attemptedUserId,
                          email: customerEmail,
                          reference: referenceCandidates[0] || String(reference || ''),
                          references: referenceCandidates,
                          amount: safeAmount,
                          details: { attemptId: activationAttemptDoc.id },
                        })
                        console.log('[webhook][monnify][transaction] activation processed successfully from attempt record')
                      } catch (activationError) {
                        console.error('[webhook][monnify][transaction] activation failed from attempt record:', activationError)
                      }
                    } else {
                      console.log('[webhook][monnify][transaction] activation attempt record missing userId:', activationAttemptDoc.id)
                    }
                  } else {
                    console.log('[webhook][monnify][transaction] no matching transaction found for reference:', reference)
                  }
                }
              }
            }
          }
        } catch (processError) {
          console.error('[webhook][monnify][transaction] failed to process transaction:', processError)
          // Don't return error - webhook should still acknowledge receipt
        }
      }

      // Log for audit purposes
      console.log('[webhook][monnify][transaction] transaction completed', {
        reference: effectiveReference,
        transactionReference,
        paymentStatus,
        status,
        amount: safeAmount,
      })
    }

    return NextResponse.json({ success: true, message: 'Webhook processed' })
  } catch (error) {
    console.error('[webhook][monnify][transaction] error', error)
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    )
  }
}
