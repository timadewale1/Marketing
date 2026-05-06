import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { processPendingActivationReferrals } from '@/lib/paymentProcessing'

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

const TWELVE_HOURS_MS = 1000 * 60 * 60 * 12
const EARNER_AUTO_ACTIVATION_THRESHOLD = 2000
const AUTO_VERIFY_BATCH_LIMIT = 100

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  const firebaseAdmin = await initFirebaseAdmin()
  if (!firebaseAdmin?.dbAdmin) {
    return NextResponse.json({ success: false, message: 'Firebase not initialized' }, { status: 500 })
  }

  const adminDb = firebaseAdmin.dbAdmin
  const admin = await import('firebase-admin')
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - TWELVE_HOURS_MS)

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
    let skippedFlagged = 0
    let skippedMissingCampaign = 0
    let failed = 0
    const autoActivatedUserIds = new Set<string>()

    for (const sDoc of snap.docs) {
      try {
        const preview = sDoc.data() as Submission
        if (String(preview.advertiserFlagStatus || '').toLowerCase() === 'pending') {
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
          if (String(submission.advertiserFlagStatus || '').toLowerCase() === 'pending') {
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
            earnerAmount = Math.round(Number(campaign.costPerLead || 0) / 2) || 0
          }

          const fullAmount = earnerAmount * 2
          const reservedAmount = Number(submission.reservedAmount || 0)
          const advertiserId = String(submission.advertiserId || campaign.ownerId || '')

          let reservedBudgetAdjustment = 0
          let reservedToConsume = 0
          let budgetToConsume = 0
          let remainingToCover = 0

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
            const advertiserRef = adminDb.collection('advertisers').doc(advertiserId)
            const advertiserSnap = await t.get(advertiserRef)
            advertiserBalance = Number(advertiserSnap.data()?.balance || 0)
          }

          if (remainingToCover > 0 && advertiserBalance < remainingToCover) {
            throw new Error('Reserved funds for this submission are no longer available and advertiser balance cannot cover the difference')
          }

          const now = new Date()
          const userId = String(submission.userId || '')
          if (!userId) throw new Error('Submission missing userId')

          t.update(subRef, {
            status: 'Verified',
            reviewedAt: now,
            reviewedBy: 'system-auto-verify',
            rejectionReason: null,
            updatedAt: now,
            finalDecisionAt: now,
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
            lastLeadAt: now,
            completionRate,
            dailySubmissionCount: admin.firestore.FieldValue.increment(1),
            lastUpdated: now,
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

          const earnerTxRef = adminDb.collection('earnerTransactions').doc()
          t.set(earnerTxRef, {
            userId,
            campaignId,
            type: 'credit',
            amount: earnerAmount,
            status: 'completed',
            note: `Payment for ${submission.campaignTitle}`,
            createdAt: now,
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
              createdAt: now,
            })
            autoActivatedUserIds.add(userId)
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
          }
          t.update(earnerRef, earnerUpdates)

          if (advertiserId) {
            const advTxRef = adminDb.collection('advertiserTransactions').doc()
            t.set(advTxRef, {
              userId: advertiserId,
              campaignId,
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
            t.update(adminDb.collection('advertisers').doc(advertiserId), advertiserUpdates)
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

    return NextResponse.json({
      success: true,
      processed: snap.size,
      verified,
      skippedFlagged,
      skippedMissingCampaign,
      failed,
      autoActivated: autoActivatedUserIds.size,
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
