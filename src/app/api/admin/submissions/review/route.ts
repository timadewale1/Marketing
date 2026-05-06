import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { requireAdminSession } from '@/lib/admin-session'
import { sendEarnerStrikeEmail, sendEarnerStrikeRemovedEmail } from '@/lib/mailer'
import { processPendingActivationReferrals } from '@/lib/paymentProcessing'
import { getProofCleanupEligibleAt, runSubmissionProofCleanupIfDue } from '@/lib/submission-proof-cleanup'

interface Submission {
  status?: string
  earnerPrice?: number | string
  campaignId?: string
  userId?: string
  advertiserId?: string
  campaignTitle?: string
  reservedAmount?: number | string
  [key: string]: unknown
}

interface Campaign {
  budget?: number | string
  costPerLead?: number | string
  reservedBudget?: number | string
  generatedLeads?: number | string
  estimatedLeads?: number | string
  ownerId?: string
  status?: string
  [key: string]: unknown
}

const EARNER_AUTO_ACTIVATION_THRESHOLD = 2000

type StrikeEmailPayload =
  | { type: 'added'; email: string; name?: string; strikeCount: number; reason?: string | null; suspended: boolean }
  | { type: 'removed'; email: string; name?: string; strikeCount: number }

export async function POST(req: Request): Promise<Response> {
  const sessionResult = await requireAdminSession()
  if ('errorResponse' in sessionResult) {
    return sessionResult.errorResponse as Response
  }
  const body = await req.json()
  const { action, rejectionReason, submissionId, userId: bodyUserId, campaignId: bodyCampaignId } = body
  const firebaseAdmin = await initFirebaseAdmin()
  if (!firebaseAdmin || !firebaseAdmin.dbAdmin) {
    return NextResponse.json({ success: false, message: 'Firebase not initialized' }, { status: 500 })
  }
  const adminDb = firebaseAdmin.dbAdmin
  const admin = await import('firebase-admin')
  const now = new Date()
  const cleanupEligibleAt = getProofCleanupEligibleAt(now)
  const adminUid = req.headers.get('x-admin-uid') || 'system'
  let strikeEmailPayload: StrikeEmailPayload | null = null
  let autoActivatedUserId: string | null = null

  try {
    // Try direct lookup in possible collections
    let subRef = adminDb.collection('submissions').doc(submissionId)
    let subSnap = await subRef.get()
    if (!subSnap.exists) {
      subRef = adminDb.collection('earnerSubmissions').doc(submissionId)
      subSnap = await subRef.get()
    }
    // Fallback: try to locate submission by campaignId + userId if provided
    if (!subSnap.exists && bodyUserId && bodyCampaignId) {
      const q = adminDb.collection('earnerSubmissions')
        .where('userId', '==', bodyUserId)
        .where('campaignId', '==', bodyCampaignId)
        .where('status', '==', 'Pending')
        .orderBy('createdAt', 'desc')
        .limit(1)
      const snaps = await q.get()
      if (!snaps.empty) {
        const docFound = snaps.docs[0]
        subRef = docFound.ref
        subSnap = await subRef.get()
      }
    }
    if (!subSnap.exists) {
      return NextResponse.json({ success: false, message: 'Submission not found' }, { status: 404 })
    }
    const submission = subSnap.data() as Submission
    const prevStatus = submission.status
    const earnerRef = adminDb.collection('earners').doc(String(submission.userId || bodyUserId || ''))
    const earnerSnap = await earnerRef.get()
    const earnerData = earnerSnap.data() as { strikeCount?: number; email?: string; name?: string; fullName?: string; status?: string } | undefined
    const currentStrikeCount = Number(earnerData?.strikeCount || 0)
    const earnerEmail = String(earnerData?.email || '').trim()
    const earnerName = String(earnerData?.fullName || earnerData?.name || '').trim() || undefined

    await adminDb.runTransaction(async (t) => {
      if (action === 'Verified') {
        if (prevStatus === 'Verified') return // idempotent

        // Fetch campaign
        const campaignId = submission.campaignId as string | undefined
        if (!campaignId) throw new Error('Submission missing campaignId')
        const campaignRef = adminDb.collection('campaigns').doc(campaignId)
        const campaignSnap = await t.get(campaignRef)
        if (!campaignSnap.exists) {
          throw new Error('Campaign no longer exists. It was likely deleted after submissions were created, so pending proofs cannot be verified.')
        }
        const campaign = campaignSnap.data() as Campaign
        const campaignBudget = Number(campaign.budget || 0)
        const campaignReservedBudget = Number(campaign.reservedBudget || 0)
        const earnerAmount = Number(submission.earnerPrice || 0)
        const fullAmount = earnerAmount * 2
        const reservedAmount = Number(submission.reservedAmount || 0)
        const advertiserId = submission.advertiserId || campaign.ownerId
        const flagPending = String(submission.advertiserFlagStatus || '') === 'pending'
        let reservedBudgetAdjustment = 0
        let reservedToConsume = 0
        let budgetToConsume = 0
        let remainingToCover = 0
        let advertiserUnfoundedFlags = 0

        if (reservedAmount > 0) {
          const pendingSnap = await t.get(
            adminDb
              .collection('earnerSubmissions')
              .where('campaignId', '==', campaignId)
              .where('status', '==', 'Pending')
          )
          const expectedReservedBudget = pendingSnap.docs.reduce((sum, pendingDoc) => {
            const pendingData = pendingDoc.data() as Submission
            return sum + Number(pendingData.reservedAmount || 0)
          }, 0)

          if (expectedReservedBudget > campaignReservedBudget) {
            reservedBudgetAdjustment = expectedReservedBudget - campaignReservedBudget
          }

          const effectiveReservedBudget = campaignReservedBudget + reservedBudgetAdjustment
          if (effectiveReservedBudget < reservedAmount) {
            throw new Error('Reserved funds for this submission are no longer available')
          }
          reservedToConsume = reservedAmount
        } else {
          budgetToConsume = Math.min(campaignBudget, fullAmount)
          remainingToCover = Math.max(0, fullAmount - budgetToConsume)
        }

        let advertiserBalance = 0
        if (remainingToCover > 0 && advertiserId) {
          const advertiserRef = adminDb.collection('advertisers').doc(String(advertiserId))
          const advertiserSnap = await t.get(advertiserRef)
          advertiserBalance = Number(advertiserSnap.data()?.balance || 0)
        }

        if (remainingToCover > 0 && advertiserBalance < remainingToCover) {
          throw new Error('Reserved funds for this submission are no longer available and advertiser balance cannot cover the difference')
        }

        if (flagPending && advertiserId) {
          const advertiserFlagSnap = await t.get(adminDb.collection('advertisers').doc(String(advertiserId)))
          advertiserUnfoundedFlags = Number(advertiserFlagSnap.data()?.unfoundedSubmissionFlags || 0)
        }

        // 1) Update submission (add updatedAt to ensure clients pick up change)
        t.update(subRef, {
          status: 'Verified',
          reviewedAt: now,
          reviewedBy: adminUid,
          rejectionReason: null,
          proofCleanupEligibleAt: cleanupEligibleAt,
          proofCleanupStatus: 'scheduled',
          proofsDeletedAt: null,
          updatedAt: now,
          finalDecisionAt: now,
          finalDecisionBy: adminUid,
          finalDecisionSource: 'admin',
          ...(flagPending ? {
            advertiserFlagStatus: 'overruled',
            advertiserFlagReviewedAt: now,
            advertiserFlagDecision: 'approved_by_admin',
          } : {}),
        })

        if (prevStatus === 'Rejected') {
          const nextStrikeCount = Math.max(0, currentStrikeCount - 1)
          t.set(earnerRef, {
            strikeCount: nextStrikeCount,
            lastStrikeUpdatedAt: now,
          }, { merge: true })
          if (earnerEmail) {
            strikeEmailPayload = {
              type: 'removed',
              email: earnerEmail,
              name: earnerName,
              strikeCount: nextStrikeCount,
            }
          }
        }

        // 2) Update campaign stats and budget
        const estimated = Number(campaign.estimatedLeads || 0)
        const completedLeads = Number(campaign.generatedLeads || 0) + 1
        const completionRate = estimated > 0 ? (completedLeads / estimated) * 100 : 0
        // If reservation exists, consume from reservedBudget; otherwise decrement budget directly
        const campaignUpdates: Record<string, unknown> = {
          generatedLeads: admin.firestore.FieldValue.increment(1),
          completedLeads: admin.firestore.FieldValue.increment(1),
          lastLeadAt: now,
          completionRate,
          dailySubmissionCount: admin.firestore.FieldValue.increment(1),
        }
        if (reservedBudgetAdjustment !== 0 || reservedToConsume > 0) {
          campaignUpdates.reservedBudget = admin.firestore.FieldValue.increment(reservedBudgetAdjustment - reservedToConsume)
        }
        if (budgetToConsume > 0) {
          campaignUpdates.budget = admin.firestore.FieldValue.increment(-budgetToConsume)
        }
        if (completionRate >= 100 && campaign.status !== 'Deleted') campaignUpdates.status = 'Completed'
        // add lastUpdated so clients observing campaigns detect changes
        campaignUpdates.lastUpdated = now
        t.update(campaignRef, campaignUpdates)

        // 3) Earner transaction + balance
        const userId = submission.userId as string
        if (!userId) throw new Error('Submission missing userId')
        const liveEarnerSnap = await t.get(earnerRef)
        const liveEarnerData = liveEarnerSnap.data() as { balance?: number; activated?: boolean } | undefined
        const earnerCurrentBalance = Number(liveEarnerData?.balance || 0)
        const earnerIsActivated = Boolean(liveEarnerData?.activated)
        const shouldAutoActivate =
          !earnerIsActivated &&
          earnerCurrentBalance + earnerAmount >= EARNER_AUTO_ACTIVATION_THRESHOLD
        const activationDeduction = shouldAutoActivate ? EARNER_AUTO_ACTIVATION_THRESHOLD : 0
        const netEarning = earnerAmount - activationDeduction

        const earnerTxRef = adminDb.collection('earnerTransactions').doc()
        t.set(earnerTxRef, {
          userId: userId,
          campaignId: submission.campaignId,
          type: 'credit',
          amount: earnerAmount,
          status: 'completed',
          note: `Payment for ${submission.campaignTitle}`,
          createdAt: now,
        })
        if (shouldAutoActivate) {
          const activationTxRef = adminDb.collection('earnerTransactions').doc()
          t.set(activationTxRef, {
            userId: userId,
            campaignId: submission.campaignId,
            type: 'activation_fee',
            amount: -activationDeduction,
            status: 'completed',
            note: 'Automatic account activation from wallet earnings',
            createdAt: now,
          })
        }

        const earnerUpdates: Record<string, unknown> = {
          balance: admin.firestore.FieldValue.increment(netEarning),
          leadsPaidFor: admin.firestore.FieldValue.increment(1),
          totalEarned: admin.firestore.FieldValue.increment(earnerAmount),
          lastEarnedAt: now,
        }
        if (shouldAutoActivate) {
          earnerUpdates.activated = true
          earnerUpdates.activatedAt = now
          earnerUpdates.activationPaymentProvider = 'wallet_auto'
          earnerUpdates.pendingActivationProvider = admin.firestore.FieldValue.delete()
          earnerUpdates.pendingActivationReference = admin.firestore.FieldValue.delete()
          earnerUpdates.needsReactivation = false
          autoActivatedUserId = userId
        }
        t.update(adminDb.collection('earners').doc(userId), earnerUpdates)

        // 4) Advertiser transaction + stats
        if (advertiserId) {
          const advTxRef = adminDb.collection('advertiserTransactions').doc()
          t.set(advTxRef, {
            userId: advertiserId,
            campaignId: submission.campaignId,
            type: 'debit',
            amount: fullAmount,
            status: 'completed',
            note: `Payment for lead in ${submission.campaignTitle}`,
            createdAt: now,
          })
          const advertiserUpdates: Record<string, unknown> = {
            totalSpent: admin.firestore.FieldValue.increment(fullAmount),
            leadsGenerated: admin.firestore.FieldValue.increment(1),
            lastLeadAt: now,
          }
          if (remainingToCover > 0) {
            advertiserUpdates.balance = admin.firestore.FieldValue.increment(-remainingToCover)
          }
          if (flagPending) {
            advertiserUpdates.unfoundedSubmissionFlags = admin.firestore.FieldValue.increment(1)
            if (advertiserUnfoundedFlags + 1 >= 5) {
              advertiserUpdates.flaggingRestricted = true
              advertiserUpdates.flaggingRestrictedAt = now
              advertiserUpdates.flaggingRestrictionReason = 'Repeated submission flags were overruled by admin review'
            }
          }
          t.update(adminDb.collection('advertisers').doc(advertiserId), advertiserUpdates)
        }
      } else if (action === 'Rejected') {
        if (prevStatus === 'Rejected') return // idempotent

        // If previously verified, reverse funds
        const wasVerified = prevStatus === 'Verified'
        const campaignId = submission.campaignId
        const userId = submission.userId as string
        if (!userId) throw new Error('Submission missing userId')

        let campaignRef: FirebaseFirestore.DocumentReference | null = null
        let campaignSnap: FirebaseFirestore.DocumentSnapshot | null = null
        let campaign: Campaign | null = null
        let advertiserId: string | undefined

        if (campaignId) {
          campaignRef = adminDb.collection('campaigns').doc(campaignId)
          campaignSnap = await t.get(campaignRef)
          campaign = campaignSnap.exists ? campaignSnap.data() as Campaign : null
          advertiserId = String(submission.advertiserId || campaign?.ownerId || '') || undefined
        } else {
          advertiserId = submission.advertiserId ? String(submission.advertiserId) : undefined
        }

        // compute earnerAmount/fullAmount (prefer submission, fall back to campaign costPerLead)
        let earnerAmount = Number(submission.earnerPrice || 0)
        let fullAmount = earnerAmount * 2
        const flagPending = String(submission.advertiserFlagStatus || '') === 'pending'
        const finalRejectionReason = String(rejectionReason || submission.advertiserFlagReason || '').trim()
        if (!finalRejectionReason) {
          throw new Error('A clear rejection reason is required so the earner can see what went wrong.')
        }
        if ((!earnerAmount || earnerAmount === 0) && campaign) {
          const costPerLeadTmp = Number(campaign.costPerLead || 0)
          if (costPerLeadTmp > 0) earnerAmount = Math.round(costPerLeadTmp / 2)
          fullAmount = Number(submission.reservedAmount || earnerAmount * 2)
        }

        // Update submission with rejection metadata
        t.update(subRef, {
          status: 'Rejected',
          reviewedAt: now,
          reviewedBy: adminUid,
          rejectionReason: finalRejectionReason,
          proofCleanupEligibleAt: cleanupEligibleAt,
          proofCleanupStatus: 'scheduled',
          proofsDeletedAt: null,
          updatedAt: now,
          finalDecisionAt: now,
          finalDecisionBy: adminUid,
          finalDecisionSource: 'admin',
          ...(flagPending ? {
            advertiserFlagStatus: 'upheld',
            advertiserFlagReviewedAt: now,
            advertiserFlagDecision: 'rejected_by_admin',
          } : {}),
        })

        const nextStrikeCount = currentStrikeCount + 1
        const shouldSuspend = nextStrikeCount >= 5
        const earnerUpdates: Record<string, unknown> = {
          strikeCount: nextStrikeCount,
          lastStrikeUpdatedAt: now,
        }
        if (shouldSuspend) {
          earnerUpdates.status = 'suspended'
          earnerUpdates.suspensionReason = 'Reached 5 rejected submission strikes'
          earnerUpdates.suspendedAt = now
        }
        t.set(earnerRef, earnerUpdates, { merge: true })
        if (earnerEmail) {
          strikeEmailPayload = {
            type: 'added',
            email: earnerEmail,
            name: earnerName,
            strikeCount: nextStrikeCount,
            reason: finalRejectionReason,
            suspended: shouldSuspend,
          }
        }

        if (flagPending && advertiserId) {
          t.set(adminDb.collection('advertisers').doc(String(advertiserId)), {
            upheldSubmissionFlags: admin.firestore.FieldValue.increment(1),
            lastSubmissionFlagUpheldAt: now,
          }, { merge: true })
        }

        if (wasVerified && earnerAmount > 0) {
          if (!campaignId) throw new Error('Submission missing campaignId')
          if (!campaignRef || !campaignSnap) throw new Error('Campaign not found for rejection reversal')

          // 1) Add reversal transaction for earner and decrement balance
          const earnerRevRef = adminDb.collection('earnerTransactions').doc()
          t.set(earnerRevRef, {
            userId: userId,
            campaignId,
            type: 'reversal',
            amount: -earnerAmount,
            status: 'completed',
            note: `Reversal for rejected submission ${submission.campaignTitle}`,
            createdAt: now,
          })
          t.update(adminDb.collection('earners').doc(userId), {
            balance: admin.firestore.FieldValue.increment(-earnerAmount),
            leadsPaidFor: admin.firestore.FieldValue.increment(-1),
            totalEarned: admin.firestore.FieldValue.increment(-earnerAmount),
          })

          // 2) Refund advertiser and restore campaign budget (or release reserved funds)
          if (advertiserId) {
            const advRef = adminDb.collection('advertiserTransactions').doc()
            t.set(advRef, {
              userId: advertiserId,
              campaignId,
              type: 'refund',
              amount: fullAmount,
              status: 'completed',
              note: `Refund for rejected submission ${submission.campaignTitle}`,
              createdAt: now,
            })
            t.update(adminDb.collection('advertisers').doc(advertiserId), {
              totalSpent: admin.firestore.FieldValue.increment(-fullAmount),
              leadsGenerated: admin.firestore.FieldValue.increment(-1),
            })
            // If this submission had a reservedAmount, return that reserved amount to budget; otherwise increment budget
            if (campaignSnap.exists) {
              const reservedAmt = Number(submission.reservedAmount || 0)
              if (reservedAmt > 0) {
                if (campaign?.status === 'Deleted') {
                  t.update(campaignRef, {
                    generatedLeads: admin.firestore.FieldValue.increment(-1),
                    reservedBudget: admin.firestore.FieldValue.increment(-reservedAmt),
                    completedLeads: admin.firestore.FieldValue.increment(-1),
                  })
                  if (advertiserId) {
                    t.update(adminDb.collection('advertisers').doc(advertiserId), {
                      balance: admin.firestore.FieldValue.increment(reservedAmt),
                    })
                  }
                } else {
                  t.update(campaignRef, {
                    generatedLeads: admin.firestore.FieldValue.increment(-1),
                    reservedBudget: admin.firestore.FieldValue.increment(-reservedAmt),
                    budget: admin.firestore.FieldValue.increment(reservedAmt),
                    completedLeads: admin.firestore.FieldValue.increment(-1),
                  })
                }
              } else {
                if (campaign?.status === 'Deleted') {
                  t.update(campaignRef, {
                    generatedLeads: admin.firestore.FieldValue.increment(-1),
                    completedLeads: admin.firestore.FieldValue.increment(-1),
                  })
                  if (advertiserId) {
                    t.update(adminDb.collection('advertisers').doc(advertiserId), {
                      balance: admin.firestore.FieldValue.increment(fullAmount),
                    })
                  }
                } else {
                  t.update(campaignRef, {
                    generatedLeads: admin.firestore.FieldValue.increment(-1),
                    budget: admin.firestore.FieldValue.increment(fullAmount),
                    completedLeads: admin.firestore.FieldValue.increment(-1),
                  })
                }
              }
            }
          }
      }
      // If the submission was not previously verified, we must release reserved funds (reservation created at submission time)
      if (!wasVerified && campaignId) {
        const reservedAmt = Number(submission.reservedAmount || 0)
        if (campaignSnap?.exists && campaignRef && reservedAmt > 0) {
          const campaignData2 = campaignSnap.data() as Campaign
          if (campaignData2?.status === 'Deleted') {
            t.update(campaignRef, {
              reservedBudget: admin.firestore.FieldValue.increment(-reservedAmt),
            })
            const advertiserId = submission.advertiserId || campaignData2?.ownerId
            if (advertiserId) {
              t.update(adminDb.collection('advertisers').doc(advertiserId), {
                balance: admin.firestore.FieldValue.increment(reservedAmt),
              })
            }
          } else {
            t.update(campaignRef, {
              reservedBudget: admin.firestore.FieldValue.increment(-reservedAmt),
              budget: admin.firestore.FieldValue.increment(reservedAmt),
            })
          }
        }
      }
      } else {
        throw new Error('Unknown action')
      }
    })

    if (autoActivatedUserId) {
      await processPendingActivationReferrals(adminDb, admin, autoActivatedUserId)
    }

    await runSubmissionProofCleanupIfDue(admin, adminDb)

    const emailPayload = strikeEmailPayload as StrikeEmailPayload | null
    if (emailPayload?.type === 'added') {
      sendEarnerStrikeEmail({
        email: emailPayload.email,
        name: emailPayload.name,
        strikeCount: emailPayload.strikeCount,
        reason: emailPayload.reason,
        suspended: emailPayload.suspended,
      }).catch((error) => {
        console.error('Failed to send earner strike email', error)
      })
    } else if (emailPayload?.type === 'removed') {
      sendEarnerStrikeRemovedEmail({
        email: emailPayload.email,
        name: emailPayload.name,
        strikeCount: emailPayload.strikeCount,
      }).catch((error) => {
        console.error('Failed to send earner strike removal email', error)
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Submission review error:', err)
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
