import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { processPendingActivationReferrals } from '@/lib/paymentProcessing'
import { TASK_APPROVAL_POINTS, awardPointsInTransaction, getPointsEventId } from '@/lib/points'
import { EARNER_STRIKE_SYSTEM_ENABLED, toDateFromTimestampLike } from '@/lib/earner-suspension'
import { proxyToBackendIfConfigured } from '@/lib/backend-route-proxy'
import { computeAdvertiserCharge, computeEarnerPayout } from '@/lib/task-pricing'

interface Submission {
  status?: string
  earnerPrice?: number | string
  campaignId?: string
  userId?: string
  advertiserId?: string
  campaignTitle?: string
  reservedAmount?: number | string
  advertiserFlagStatus?: string
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

async function resolveOwnerRef(adminDb: NonNullable<Awaited<ReturnType<typeof initFirebaseAdmin>>['dbAdmin']>, ownerId: string) {
  const advertiserRef = adminDb.collection('advertisers').doc(ownerId)
  const vendorRef = adminDb.collection('vendors').doc(ownerId)
  const [advertiserSnap, vendorSnap] = await Promise.all([advertiserRef.get(), vendorRef.get()])
  if (advertiserSnap.exists) return advertiserRef
  if (vendorSnap.exists) return vendorRef
  return null
}

const TWENTY_FOUR_HOURS_MS = 1000 * 60 * 60 * 24
const EARNER_AUTO_ACTIVATION_THRESHOLD = 2000
const AUTO_VERIFY_BATCH_LIMIT = 100

export async function GET(request: Request) {
  const proxied = await proxyToBackendIfConfigured('/api/internal/auto-verify-submissions', request, { internalAuth: true })
  if (proxied) return proxied

  const authHeader = request.headers.get('authorization')
  // Check both API_INTERNAL_SECRET and CRON_SECRET (matches the Cloud Function's buildHeaders logic)
  const internalSecret = String(process.env.API_INTERNAL_SECRET || process.env.CRON_SECRET || '').trim()
  if (internalSecret && authHeader !== `Bearer ${internalSecret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  const firebaseAdmin = await initFirebaseAdmin()
  if (!firebaseAdmin?.dbAdmin) {
    return NextResponse.json({ success: false, message: 'Firebase not initialized' }, { status: 500 })
  }

  const adminDb = firebaseAdmin.dbAdmin
  const admin = firebaseAdmin.admin
  if (!admin) {
    return NextResponse.json({ success: false, message: 'Firebase admin unavailable' }, { status: 500 })
  }
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - TWENTY_FOUR_HOURS_MS)

  try {
    const snap = await adminDb
      .collection('earnerSubmissions')
      .where('status', '==', 'Pending')
      .where('createdAt', '<=', cutoff)
      .limit(AUTO_VERIFY_BATCH_LIMIT)
      .get()

    if (snap.empty) {
      return NextResponse.json({
        success: true,
        processed: 0,
        verified: 0,
        skippedFlagged: 0,
        skippedMissingCampaign: 0,
      })
    }

    let verified = 0
    let autoRejected = 0
    let skippedFlagged = 0
    let skippedMissingCampaign = 0
    let failed = 0
    const autoActivatedUserIds = new Set<string>()

    for (const sDoc of snap.docs) {
      try {
        const preview = sDoc.data() as Submission
        const advertiserDecisionStatus = String(preview.advertiserDecisionStatus || '').toLowerCase()
        const legacyAdvertiserFlagStatus = String(preview.advertiserFlagStatus || '').toLowerCase()
        const previewResubmissionStatus = String(preview.resubmissionStatus || '').toLowerCase()
        const previewResubmissionDueAt = toDateFromTimestampLike((preview as { resubmissionDueAt?: unknown }).resubmissionDueAt)
        if (preview.advertiserDecisionStatus === 'resubmission_requested' || previewResubmissionStatus === 'pending') {
          if (!previewResubmissionDueAt || previewResubmissionDueAt.getTime() > Date.now()) {
            skippedFlagged += 1
            continue
          }
        }
        if (
          advertiserDecisionStatus === 'pending' ||
          legacyAdvertiserFlagStatus === 'pending' ||
          advertiserDecisionStatus === 'approved' ||
          advertiserDecisionStatus === 'rejected' ||
          advertiserDecisionStatus === 'auto_verified'
        ) {
          skippedFlagged += 1
          continue
        }

        const outcome: {
          value: 'verified' | 'skipped_flagged' | 'skipped_missing_campaign' | 'skipped_stale'
        } = { value: 'skipped_stale' }

        await adminDb.runTransaction(async (t) => {
          const subRef = sDoc.ref
          const subSnap = await t.get(subRef)
          if (!subSnap.exists) {
            outcome.value = 'skipped_stale'
            return
          }

          const submission = subSnap.data() as Submission
          if (String(submission.status || '') !== 'Pending') {
            outcome.value = 'skipped_stale'
            return
          }
          const submissionDecisionStatus = String(submission.advertiserDecisionStatus || '').toLowerCase()
          const submissionLegacyFlagStatus = String(submission.advertiserFlagStatus || '').toLowerCase()
          if (
            submissionDecisionStatus === 'pending' ||
            submissionLegacyFlagStatus === 'pending' ||
            submissionDecisionStatus === 'approved' ||
            submissionDecisionStatus === 'rejected' ||
            submissionDecisionStatus === 'auto_verified'
          ) {
            outcome.value = 'skipped_flagged'
            return
          }

          const campaignId = String(submission.campaignId || '')
          if (!campaignId) throw new Error('Submission missing campaignId')

          const campaignRef = adminDb.collection('campaigns').doc(campaignId)
          const campaignSnap = await t.get(campaignRef)
          if (!campaignSnap.exists) {
            outcome.value = 'skipped_missing_campaign'
            return
          }

          const campaign = campaignSnap.data() as Campaign
          const campaignBudget = Number(campaign.budget || 0)
          const campaignReservedBudget = Number(campaign.reservedBudget || 0)
          let earnerAmount = Number(submission.earnerPrice || 0)
          if (!earnerAmount) {
            earnerAmount = computeEarnerPayout(Number(campaign.costPerLead || 0)) || 0
          }
          const reservedAmount = Number(submission.reservedAmount || 0)
          const fullAmount = computeAdvertiserCharge(reservedAmount, Number(campaign.costPerLead || 0), earnerAmount)
          const advertiserId = String(submission.advertiserId || campaign.ownerId || '')
          const submissionUserId = String(submission.userId || '')

          let reservedBudgetAdjustment = 0
          let reservedToConsume = 0
          let budgetToConsume = 0
          let remainingToCover = 0
          const now = new Date()
          const resubmissionDueAt = toDateFromTimestampLike((submission as { resubmissionDueAt?: unknown }).resubmissionDueAt)
          const resubmissionExpired =
            String(submission.advertiserDecisionStatus || '').toLowerCase() === 'resubmission_requested' &&
            Boolean(resubmissionDueAt) &&
            resubmissionDueAt!.getTime() <= Date.now()

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
            const shortage = reservedAmount - effectiveReservedBudget
            budgetToConsume = Math.min(campaignBudget, shortage)
            remainingToCover = Math.max(0, shortage - budgetToConsume)
          } else {
            reservedToConsume = reservedAmount
          }
        } else {
          budgetToConsume = Math.min(campaignBudget, fullAmount)
          remainingToCover = Math.max(0, fullAmount - budgetToConsume)
        }

          if (resubmissionExpired) {
            const finalRejectionReason = 'The requested resubmission was not received within 8 hours.'
            if (!submissionUserId) throw new Error('Submission missing userId')
            const earnerRef = adminDb.collection('earners').doc(submissionUserId)
            const earnerSnapshot = await t.get(earnerRef)
            const currentStrikeCount = Number(earnerSnapshot.data()?.strikeCount || 0)
            const nextStrikeCount = currentStrikeCount + 1
            const shouldSuspend = EARNER_STRIKE_SYSTEM_ENABLED && nextStrikeCount >= 20
            const suspension = EARNER_STRIKE_SYSTEM_ENABLED && shouldSuspend
              ? {
                  suspensionCount: Number(earnerSnapshot.data()?.suspensionCount || 0) + 1,
                  durationDays: 3,
                  releaseAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                  indefinite: false,
                }
              : null

            t.update(subRef, {
              status: 'Rejected',
              reviewedAt: now,
              reviewedBy: 'system-auto-resubmission-timeout',
              rejectionReason: finalRejectionReason,
              advertiserDecisionStatus: 'rejected',
              advertiserDecisionReason: finalRejectionReason,
              advertiserDecisionAt: now,
              advertiserDecisionBy: 'system-auto-resubmission-timeout',
              advertiserDecisionSource: 'system_auto_resubmission_timeout',
              updatedAt: now,
              finalDecisionAt: now,
              finalDecisionBy: 'system-auto-resubmission-timeout',
              finalDecisionSource: 'system_auto_resubmission_timeout',
            })

            if (EARNER_STRIKE_SYSTEM_ENABLED) {
              const earnerUpdates: Record<string, unknown> = {
                strikeCount: nextStrikeCount,
                lastStrikeUpdatedAt: now,
              }
              if (shouldSuspend && suspension) {
                earnerUpdates.status = 'suspended'
                earnerUpdates.suspensionReason = 'Reached 20 rejected submission strikes'
                earnerUpdates.suspendedAt = now
                earnerUpdates.suspensionCount = suspension.suspensionCount
                earnerUpdates.suspensionIndefinite = false
                earnerUpdates.suspensionReleaseAt = suspension.releaseAt
                earnerUpdates.suspensionDurationDays = suspension.durationDays
              }
              t.set(earnerRef, earnerUpdates, { merge: true })
            }

            if (campaignSnap.exists) {
              const reservedAmt = Number(submission.reservedAmount || 0)
              if (reservedAmt > 0) {
                if (campaign.status === 'Deleted') {
                  t.update(campaignRef, {
                    reservedBudget: admin.firestore.FieldValue.increment(-reservedAmt),
                  })
              if (advertiserId) {
                const ownerRef = await resolveOwnerRef(adminDb, advertiserId)
                if (ownerRef) {
                  t.update(ownerRef, {
                    balance: admin.firestore.FieldValue.increment(reservedAmt),
                  })
                }
              }
                } else {
                  t.update(campaignRef, {
                    reservedBudget: admin.firestore.FieldValue.increment(-reservedAmt),
                    budget: admin.firestore.FieldValue.increment(reservedAmt),
                  })
                }
              }
            }

            outcome.value = 'skipped_stale'
            autoRejected += 1
            return
          }

          let advertiserBalance = 0
          if (remainingToCover > 0 && advertiserId) {
            const advertiserRef = adminDb.collection('advertisers').doc(advertiserId)
            const advertiserSnap = await t.get(advertiserRef)
            advertiserBalance = Number(advertiserSnap.data()?.balance || 0)
          }

          if (remainingToCover > 0 && advertiserBalance < remainingToCover) {
            throw new Error('Reserved funds for this submission are no longer available and advertiser balance cannot cover the difference')
          }

          const reviewNow = new Date()
          const userId = String(submission.userId || '')
          if (!userId) throw new Error('Submission missing userId')

          const earnerRef = adminDb.collection('earners').doc(userId)
          const liveEarnerSnap = await t.get(earnerRef)
          const liveEarnerData = liveEarnerSnap.data() as { balance?: number; activated?: boolean } | undefined
          const earnerCurrentBalance = Number(liveEarnerData?.balance || 0)
          const earnerIsActivated = Boolean(liveEarnerData?.activated)
          const shouldAutoActivate =
            !earnerIsActivated &&
            earnerCurrentBalance + earnerAmount >= EARNER_AUTO_ACTIVATION_THRESHOLD
          const activationDeduction = shouldAutoActivate ? EARNER_AUTO_ACTIVATION_THRESHOLD : 0
          const netEarning = earnerAmount - activationDeduction

          await awardPointsInTransaction({
            adminDb,
            admin,
            transaction: t,
            userCollection: 'earners',
            userId,
            amount: TASK_APPROVAL_POINTS,
            eventId: getPointsEventId('task-approved', subRef.id),
            type: 'task_approved',
            note: `Approval bonus for submission ${subRef.id}`,
            referenceId: subRef.id,
            extraUserUpdates: {
              pointsApprovedTaskCount: admin.firestore.FieldValue.increment(1),
              pointsLastApprovedTaskAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            extraLedgerData: {
              submissionId: subRef.id,
              campaignId,
            },
          })

          t.update(subRef, {
            status: 'Verified',
            reviewedAt: reviewNow,
            reviewedBy: 'system-auto-verify',
            rejectionReason: null,
            advertiserDecisionStatus: 'auto_verified',
            advertiserDecisionReason: null,
            advertiserDecisionAt: reviewNow,
            advertiserDecisionBy: 'system-auto-verify',
            advertiserDecisionSource: 'system_auto_verify',
            updatedAt: reviewNow,
            finalDecisionAt: reviewNow,
            finalDecisionBy: 'system-auto-verify',
            finalDecisionSource: 'system_auto_verify',
            autoVerified: true,
          })

          const estimated = Number(campaign.estimatedLeads || 0)
          const completedLeads = Number(campaign.generatedLeads || 0) + 1
          const completionRate = estimated > 0 ? (completedLeads / estimated) * 100 : 0
          const campaignUpdates: Record<string, unknown> = {
            generatedLeads: admin.firestore.FieldValue.increment(1),
            completedLeads: admin.firestore.FieldValue.increment(1),
            lastLeadAt: reviewNow,
            completionRate,
            dailySubmissionCount: admin.firestore.FieldValue.increment(1),
            lastUpdated: reviewNow,
          }
          if (reservedBudgetAdjustment !== 0 || reservedToConsume > 0) {
            campaignUpdates.reservedBudget = admin.firestore.FieldValue.increment(reservedBudgetAdjustment - reservedToConsume)
          }
          if (budgetToConsume > 0) {
            campaignUpdates.budget = admin.firestore.FieldValue.increment(-budgetToConsume)
          }
          if (completionRate >= 100 && campaign.status !== 'Deleted') {
            campaignUpdates.status = 'Completed'
          }
          t.update(campaignRef, campaignUpdates)

          const earnerTxRef = adminDb.collection('earnerTransactions').doc()
          t.set(earnerTxRef, {
            userId,
            campaignId,
              type: 'credit',
              amount: earnerAmount,
              status: 'completed',
              note: `Payment for ${submission.campaignTitle}`,
              createdAt: reviewNow,
            })

          if (shouldAutoActivate) {
            const activationTxRef = adminDb.collection('earnerTransactions').doc()
            t.set(activationTxRef, {
              userId,
              campaignId,
              type: 'activation_fee',
              amount: -activationDeduction,
              status: 'completed',
              note: 'Automatic account activation from wallet earnings',
              createdAt: reviewNow,
            })
            autoActivatedUserIds.add(userId)
          }

          const earnerUpdates: Record<string, unknown> = {
            balance: admin.firestore.FieldValue.increment(netEarning),
            leadsPaidFor: admin.firestore.FieldValue.increment(1),
            totalEarned: admin.firestore.FieldValue.increment(earnerAmount),
            lastEarnedAt: reviewNow,
          }
          if (shouldAutoActivate) {
            earnerUpdates.activated = true
            earnerUpdates.activatedAt = reviewNow
            earnerUpdates.activationPaymentProvider = 'wallet_auto'
            earnerUpdates.pendingActivationProvider = admin.firestore.FieldValue.delete()
            earnerUpdates.pendingActivationReference = admin.firestore.FieldValue.delete()
            earnerUpdates.needsReactivation = false
          }
          t.update(earnerRef, earnerUpdates)

          if (advertiserId) {
            const ownerRef = await resolveOwnerRef(adminDb, advertiserId)
            const ownerTxCollection = ownerRef && ownerRef.path.startsWith('vendors/') ? 'vendorTransactions' : 'advertiserTransactions'
            if (ownerRef) {
              const advTxRef = adminDb.collection(ownerTxCollection).doc()
              t.set(advTxRef, {
                userId: advertiserId,
                campaignId,
              type: 'debit',
              amount: fullAmount,
              status: 'completed',
              note: `Payment for lead in ${submission.campaignTitle}`,
              createdAt: reviewNow,
            })
              const advertiserUpdates: Record<string, unknown> = {
                totalSpent: admin.firestore.FieldValue.increment(fullAmount),
                leadsGenerated: admin.firestore.FieldValue.increment(1),
                lastLeadAt: reviewNow,
              }
              if (remainingToCover > 0) {
                advertiserUpdates.balance = admin.firestore.FieldValue.increment(-remainingToCover)
              }
              t.update(ownerRef, advertiserUpdates)
            }
          }

          outcome.value = 'verified'
        })

        if (outcome.value === 'verified') {
          verified += 1
        } else if (outcome.value === 'skipped_flagged') {
          skippedFlagged += 1
        } else if (outcome.value === 'skipped_missing_campaign') {
          skippedMissingCampaign += 1
        }
      } catch (error) {
        failed += 1
        console.error('[internal][auto-verify-submissions] failed for submission', sDoc.id, error)
      }
    }

    for (const userId of autoActivatedUserIds) {
      try {
        await processPendingActivationReferrals(adminDb, admin, userId)
      } catch (error) {
        console.error('[internal][auto-verify-submissions] referral payout failed for auto-activated earner', { userId, error })
      }
    }

    let expiredCampaigns = 0
    const nowTs = admin.firestore.Timestamp.fromMillis(Date.now())
    const expiredCampaignSnap = await adminDb
      .collection('campaigns')
      .where('status', '==', 'Active')
      .where('expiresAt', '<=', nowTs)
      .limit(AUTO_VERIFY_BATCH_LIMIT)
      .get()

    for (const campaignDoc of expiredCampaignSnap.docs) {
      try {
        await adminDb.runTransaction(async (t) => {
          const campaignRef = campaignDoc.ref
          const campaignSnap = await t.get(campaignRef)
          if (!campaignSnap.exists) return

          const campaign = campaignSnap.data() as Campaign
          if (String(campaign.status || '') !== 'Active') return
          const expiresAt = (campaign as { expiresAt?: { toDate?: () => Date; seconds?: number } | Date | null }).expiresAt
          const expiresAtDate = toDateFromTimestampLike(expiresAt)
          if (!expiresAtDate || expiresAtDate.getTime() > Date.now()) return

          const ownerId = String(campaign.ownerId || '')
          const refundAmount = Math.max(0, Math.floor(Number(campaign.budget || 0) + Number(campaign.reservedBudget || 0)))

          t.update(campaignRef, {
            status: 'Expired',
            budget: 0,
            reservedBudget: 0,
            expiredAt: nowTs,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          })

          if (ownerId && refundAmount > 0) {
            const ownerRef = await resolveOwnerRef(adminDb, ownerId)
            if (ownerRef) {
              t.update(ownerRef, {
                balance: admin.firestore.FieldValue.increment(refundAmount),
              })
            }
          }
        })
        expiredCampaigns += 1
      } catch (error) {
        console.error('[internal][auto-verify-submissions] failed to expire campaign', campaignDoc.id, error)
      }
    }

    return NextResponse.json({
      success: true,
      processed: snap.size,
      verified,
      autoRejected,
      skippedFlagged,
      skippedMissingCampaign,
      failed,
      autoActivated: autoActivatedUserIds.size,
      expiredCampaigns,
    })
  } catch (error) {
    console.error('[internal][auto-verify-submissions] route failed', error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Auto verify failed',
      },
      { status: 500 }
    )
  }
}
