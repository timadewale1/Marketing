import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getActivationAttemptDocId } from '@/lib/activation-attempts'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { extractMonnifyReferenceCandidates, processActivationWithRetry, processWalletFundingWithRetry } from '@/lib/paymentProcessing'

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
  const fields: Array<'activationReference' | 'pendingActivationReference' | 'pendingActivationReferences'> = [
    'activationReference',
    'pendingActivationReference',
    'pendingActivationReferences',
  ]

  for (const reference of references) {
    for (const field of fields) {
      const queryBuilder = field === 'pendingActivationReferences'
        ? dbAdmin.collection(collectionName).where(field, 'array-contains', reference)
        : dbAdmin.collection(collectionName).where(field, '==', reference)
      const snap = await queryBuilder.limit(1).get()
      if (!snap.empty) {
        return snap.docs[0]
      }
    }
  }

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

async function findPendingWalletTransactionByEmailAndAmount(
  dbAdmin: NonNullable<Awaited<ReturnType<typeof initFirebaseAdmin>>['dbAdmin']>,
  collectionName: 'advertiserTransactions' | 'earnerTransactions',
  userCollectionName: 'advertisers' | 'earners',
  email: string,
  amount: number
) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail || !amount) return null

  const txSnap = await dbAdmin.collection(collectionName)
    .where('type', '==', 'wallet_funding')
    .where('status', '==', 'pending')
    .where('amount', '==', amount)
    .get()

  for (const txDoc of txSnap.docs) {
    const txData = txDoc.data()
    const userId = String(txData.userId || '')
    if (!userId) continue
    const userSnap = await dbAdmin.collection(userCollectionName).doc(userId).get()
    const userEmail = String(userSnap.data()?.email || '').trim().toLowerCase()
    if (userEmail && userEmail === normalizedEmail) {
      return txDoc
    }
  }

  return null
}

async function findActivationUserByEmail(
  dbAdmin: NonNullable<Awaited<ReturnType<typeof initFirebaseAdmin>>['dbAdmin']>,
  collectionName: 'advertisers' | 'earners',
  email: string
) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return null

  const snap = await dbAdmin.collection(collectionName)
    .where('email', '==', normalizedEmail)
    .limit(1)
    .get()

  if (snap.empty) return null

  const doc = snap.docs[0]
  if (doc.data()?.activated) return null
  return doc
}

async function findActivationAttemptByReferences(
  dbAdmin: NonNullable<Awaited<ReturnType<typeof initFirebaseAdmin>>['dbAdmin']>,
  references: string[]
) {
  for (const reference of references) {
    const snap = await dbAdmin.collection('activationAttempts')
      .where('references', 'array-contains', reference)
      .limit(1)
      .get()

    if (!snap.empty) {
      const doc = snap.docs[0]
      if (String(doc.data()?.status || '').toLowerCase() !== 'completed') {
        return doc
      }
    }
  }

  return null
}

async function findActivationAttemptByEmail(
  dbAdmin: NonNullable<Awaited<ReturnType<typeof initFirebaseAdmin>>['dbAdmin']>,
  email: string
) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return null

  const snap = await dbAdmin.collection('activationAttempts')
    .where('email', '==', normalizedEmail)
    .limit(5)
    .get()

  const pendingDoc = snap.docs.find((doc) => String(doc.data()?.status || '').toLowerCase() !== 'completed')
  return pendingDoc || null
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
    console.log('[webhook][monnify][transaction] received event', {
      eventType: payload.eventType,
      reference: payload.eventData?.reference,
      status: payload.eventData?.status,
    })

    // Initialize Firebase admin for processing
    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin || !admin) {
      console.error('[webhook][monnify][transaction] Firebase admin not initialized')
      return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
    }

    const { eventType, eventData } = payload

    if (eventType === 'TRANSACTION_COMPLETION') {
      const { reference, status, amount, transactionReference } = eventData
      const customerEmail = String(
        (eventData?.customer && typeof eventData.customer === 'object'
          ? (eventData.customer as Record<string, unknown>).email
          : '') || ''
      ).trim().toLowerCase()
      const referenceCandidates = extractMonnifyReferenceCandidates(
        String(reference || ''),
        eventData as Record<string, unknown>,
        typeof transactionReference === 'string' ? transactionReference : null
      )

      console.log('[webhook][monnify][transaction] processing transaction', {
        reference,
        status,
        amount,
      })

      // Handle transaction completion - process activation and wallet funding
      if (status === 'SUCCESSFUL' || status === 'SUCCESS') {
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
            reference: referenceCandidates[0] || String(reference || ''),
            referenceCandidates,
            eventType: 'TRANSACTION_COMPLETION',
            status,
            amount,
            transactionReference: transactionReference || null,
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
          })
          // Check if this is a wallet funding transaction (advertiser first, then earner)
          const walletTxDoc = await findPendingWalletTransactionByReferences(
            dbAdmin,
            'advertiserTransactions',
            referenceCandidates
          )
          const matchedAdvertiserWalletTxDoc = walletTxDoc || await findPendingWalletTransactionByEmailAndAmount(
            dbAdmin,
            'advertiserTransactions',
            'advertisers',
            customerEmail,
            Number(amount || 0)
          )

          if (matchedAdvertiserWalletTxDoc) {
            const txData = matchedAdvertiserWalletTxDoc.data()

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
            const matchedEarnerWalletTxDoc = earnerTxDoc || await findPendingWalletTransactionByEmailAndAmount(
              dbAdmin,
              'earnerTransactions',
              'earners',
              customerEmail,
              Number(amount || 0)
            )

            if (matchedEarnerWalletTxDoc) {
              const txData = matchedEarnerWalletTxDoc.data()

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
                console.log('[webhook][monnify][transaction] earner wallet funding processed successfully')
              } catch (fundingError) {
                console.error('[webhook][monnify][transaction] earner wallet funding failed:', fundingError)
              }
            } else {
              // Check if this is an activation payment (advertiser first, then earner)
              const advertiserDoc =
                await findActivationUserByReferences(dbAdmin, 'advertisers', referenceCandidates) ||
                await findActivationUserByEmail(dbAdmin, 'advertisers', customerEmail)

              if (advertiserDoc) {
                console.log('[webhook][monnify][transaction] processing activation for advertiser', advertiserDoc.id)

                try {
                  await processActivationWithRetry(advertiserDoc.id, referenceCandidates[0] || String(reference || ''), 'monnify', 3, referenceCandidates)
                  console.log('[webhook][monnify][transaction] activation processed successfully')
                } catch (activationError) {
                  console.error('[webhook][monnify][transaction] activation failed:', activationError)
                }
              } else {
                const earnerDoc =
                  await findActivationUserByReferences(dbAdmin, 'earners', referenceCandidates) ||
                  await findActivationUserByEmail(dbAdmin, 'earners', customerEmail)

                if (earnerDoc) {
                  console.log('[webhook][monnify][transaction] processing activation for earner', earnerDoc.id)

                  try {
                    await processActivationWithRetry(earnerDoc.id, referenceCandidates[0] || String(reference || ''), 'monnify', 3, referenceCandidates)
                    console.log('[webhook][monnify][transaction] activation processed successfully')
                  } catch (activationError) {
                    console.error('[webhook][monnify][transaction] activation failed:', activationError)
                  }
                } else {
                  const activationAttemptDoc =
                    await findActivationAttemptByReferences(dbAdmin, referenceCandidates) ||
                    await findActivationAttemptByEmail(dbAdmin, customerEmail)

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
                          referenceCandidates
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
        reference,
        transactionReference,
        status,
        amount,
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
