import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { buildNextEarnerSuspension, EARNER_STRIKE_SUSPENSION_THRESHOLD } from '@/lib/earner-suspension'
import { sendEarnerStrikeEmail } from '@/lib/mailer'
import { getProofCleanupEligibleAt, runSubmissionProofCleanupIfDue } from '@/lib/submission-proof-cleanup'
import { TASK_APPROVAL_POINTS, awardPointsInTransaction, getPointsEventId } from '@/lib/points'

interface Submission {
  status?: string
  earnerPrice?: number | string
  campaignId?: string
  userId?: string
  advertiserId?: string
  campaignTitle?: string
  reservedAmount?: number | string
  advertiserDecisionStatus?: string
  advertiserDecisionReason?: string | null
  advertiserDecisionAt?: unknown
  advertiserDecisionBy?: string | null
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

type StrikeEmailPayload = {
  email: string
  name?: string
  strikeCount: number
  reason?: string | null
  suspended: boolean
}

function normalizeAction(action: unknown) {
  const value = String(action || '').trim().toLowerCase()
  if (value === 'verified' || value === 'approve' || value === 'approved') return 'Verified' as const
  if (value === 'rejected' || value === 'reject') return 'Rejected' as const
  return null
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const normalizedSubmissionId = String(body?.submissionId || '').trim()
    const normalizedReason = String(body?.reason || '').trim()
    const action = normalizeAction(body?.action)

    if (!normalizedSubmissionId) {
      return NextResponse.json({ success: false, message: 'Submission is required' }, { status: 400 })
    }
    if (!action) {
      return NextResponse.json({ success: false, message: 'A valid review action is required' }, { status: 400 })
    }
    if (action === 'Rejected' && normalizedReason.length < 10) {
      return NextResponse.json(
        { success: false, message: 'Please explain clearly why this proof should be rejected.' },
        { status: 400 }
      )
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })
    }

    const decoded = await admin.auth().verifyIdToken(authHeader.slice(7))
    const advertiserId = decoded.uid
    const db = dbAdmin as import('firebase-admin').firestore.Firestore
    const now = new Date()
    const cleanupEligibleAt = getProofCleanupEligibleAt(now)
    const submissionRef = db.collection('earnerSubmissions').doc(normalizedSubmissionId)

    const submissionSnap = await submissionRef.get()
    if (!submissionSnap.exists) {
      return NextResponse.json({ success: false, message: 'Submission not found' }, { status: 404 })
    }

    const submission = submissionSnap.data() as Submission
    if (String(submission.advertiserId || '') !== advertiserId) {
      return NextResponse.json({ success: false, message: 'You can only review submissions for your own tasks' }, { status: 403 })
    }

    const reviewStatus = String(submission.advertiserDecisionStatus || '').trim().toLowerCase()
    if (reviewStatus === 'approved' || reviewStatus === 'rejected') {
      if ((reviewStatus === 'approved' && action === 'Verified') || (reviewStatus === 'rejected' && action === 'Rejected')) {
        return NextResponse.json({ success: true, message: 'This submission was already reviewed' })
      }
      return NextResponse.json({ success: false, message: 'This submission has already been reviewed and cannot be changed' }, { status: 400 })
    }

    if (String(submission.status || '') !== 'Pending') {
      return NextResponse.json({ success: false, message: 'Only pending submissions can be reviewed by the advertiser' }, { status: 400 })
    }

    const earnerRef = db.collection('earners').doc(String(submission.userId || ''))
    const earnerSnap = await earnerRef.get()
    const earnerData = earnerSnap.data() as {
      status?: string
      strikeCount?: number
      suspensionCount?: number | string
      suspensionReleaseAt?: Date | string | number | { seconds?: number; toDate?: () => Date } | null
      email?: string
      name?: string
      fullName?: string
    } | undefined
    const currentStrikeCount = Number(earnerData?.strikeCount || 0)
    const earnerEmail = String(earnerData?.email || '').trim()
    const earnerName = String(earnerData?.fullName || earnerData?.name || '').trim() || undefined
    const strikeEmailPayload: { current?: StrikeEmailPayload } = {}

    await db.runTransaction(async (t) => {
      const campaignId = String(submission.campaignId || '')
      if (!campaignId) {
        throw new Error('Submission missing campaignId')
      }

      const campaignRef = db.collection('campaigns').doc(campaignId)
      const campaignSnap = await t.get(campaignRef)
      if (!campaignSnap.exists) {
        throw new Error('Campaign no longer exists. This submission cannot be reviewed until the source campaign is restored or the task is handled by admin.')
      }
      const campaign = campaignSnap.data() as Campaign

      const userId = String(submission.userId || '')
      if (!userId) {
        throw new Error('Submission missing userId')
      }

      const campaignBudget = Number(campaign.budget || 0)
      const campaignReservedBudget = Number(campaign.reservedBudget || 0)
      let earnerAmount = Number(submission.earnerPrice || 0)
      if (!earnerAmount) {
        earnerAmount = Math.round(Number(campaign.costPerLead || 0) / 2) || 0
      }
      const fullAmount = earnerAmount * 2
      const reservedAmount = Number(submission.reservedAmount || 0)
      const advertiserRef = db.collection('advertisers').doc(advertiserId)
      const advertiserSnap = await t.get(advertiserRef)
      const advertiserBalance = Number(advertiserSnap.data()?.balance || 0)

      let reservedBudgetAdjustment = 0
      let reservedToConsume = 0
      let budgetToConsume = 0
      let remainingToCover = 0

      if (reservedAmount > 0) {
        const pendingSnap = await t.get(
          db.collection('earnerSubmissions').where('campaignId', '==', campaignId).where('status', '==', 'Pending')
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

      if (action === 'Verified') {
        if (remainingToCover > 0 && advertiserBalance < remainingToCover) {
          throw new Error('Reserved funds for this submission are no longer available and advertiser balance cannot cover the difference')
        }

        await awardPointsInTransaction({
          adminDb: db,
          admin,
          transaction: t,
          userCollection: 'earners',
          userId,
          amount: TASK_APPROVAL_POINTS,
          eventId: getPointsEventId('task-approved', submissionRef.id),
          type: 'task_approved',
          note: `Approval bonus for submission ${submissionRef.id}`,
          referenceId: submissionRef.id,
          extraUserUpdates: {
            pointsApprovedTaskCount: admin.firestore.FieldValue.increment(1),
            pointsLastApprovedTaskAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          extraLedgerData: {
            submissionId: submissionRef.id,
            campaignId,
          },
        })

        t.update(submissionRef, {
          status: 'Verified',
          reviewedAt: now,
          reviewedBy: advertiserId,
          rejectionReason: null,
          advertiserDecisionStatus: 'approved',
          advertiserDecisionReason: null,
          advertiserDecisionAt: now,
          advertiserDecisionBy: advertiserId,
          advertiserDecisionSource: 'advertiser',
          finalDecisionAt: now,
          finalDecisionBy: advertiserId,
          finalDecisionSource: 'advertiser',
          proofCleanupEligibleAt: cleanupEligibleAt,
          proofCleanupStatus: 'scheduled',
          proofsDeletedAt: null,
          updatedAt: now,
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

        const earnerTxRef = db.collection('earnerTransactions').doc()
        t.set(earnerTxRef, {
          userId,
          campaignId,
          type: 'credit',
          amount: earnerAmount,
          status: 'completed',
          note: `Payment for ${submission.campaignTitle}`,
          createdAt: now,
        })

        t.update(earnerRef, {
          balance: admin.firestore.FieldValue.increment(earnerAmount),
          leadsPaidFor: admin.firestore.FieldValue.increment(1),
          totalEarned: admin.firestore.FieldValue.increment(earnerAmount),
          lastEarnedAt: now,
        })

        const advTxRef = db.collection('advertiserTransactions').doc()
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
        t.update(advertiserRef, advertiserUpdates)
      } else {
        const finalRejectionReason = normalizedReason
        const nextStrikeCount = currentStrikeCount + 1
        const shouldSuspend = nextStrikeCount >= EARNER_STRIKE_SUSPENSION_THRESHOLD
        const suspension = buildNextEarnerSuspension(
          {
            status: earnerData?.status,
            suspensionCount: earnerData?.suspensionCount,
            suspensionReleaseAt: earnerData?.suspensionReleaseAt,
          },
          now
        )
        const earnerUpdates: Record<string, unknown> = {
          strikeCount: nextStrikeCount,
          lastStrikeUpdatedAt: now,
        }
        if (shouldSuspend) {
          earnerUpdates.status = 'suspended'
          earnerUpdates.suspensionReason = 'Reached 5 rejected submission strikes'
          earnerUpdates.suspendedAt = now
          earnerUpdates.suspensionCount = suspension.suspensionCount
          earnerUpdates.suspensionIndefinite = suspension.indefinite
          if (suspension.releaseAt) {
            earnerUpdates.suspensionReleaseAt = suspension.releaseAt
            earnerUpdates.suspensionDurationDays = suspension.durationDays
          } else {
            earnerUpdates.suspensionReleaseAt = admin.firestore.FieldValue.delete()
            earnerUpdates.suspensionDurationDays = admin.firestore.FieldValue.delete()
          }
        }
        t.set(earnerRef, earnerUpdates, { merge: true })
        if (earnerEmail) {
          strikeEmailPayload.current = {
            email: earnerEmail,
            name: earnerName,
            strikeCount: nextStrikeCount,
            reason: finalRejectionReason,
            suspended: shouldSuspend,
          }
        }

        t.update(submissionRef, {
          status: 'Rejected',
          reviewedAt: now,
          reviewedBy: advertiserId,
          rejectionReason: finalRejectionReason,
          advertiserDecisionStatus: 'rejected',
          advertiserDecisionReason: finalRejectionReason,
          advertiserDecisionAt: now,
          advertiserDecisionBy: advertiserId,
          advertiserDecisionSource: 'advertiser',
          finalDecisionAt: now,
          finalDecisionBy: advertiserId,
          finalDecisionSource: 'advertiser',
          proofCleanupEligibleAt: cleanupEligibleAt,
          proofCleanupStatus: 'scheduled',
          proofsDeletedAt: null,
          updatedAt: now,
        })

        if (reservedAmount > 0) {
          if (campaign.status === 'Deleted') {
            t.update(campaignRef, {
              reservedBudget: admin.firestore.FieldValue.increment(-reservedAmount),
            })
            t.update(advertiserRef, {
              balance: admin.firestore.FieldValue.increment(reservedAmount),
            })
          } else {
            t.update(campaignRef, {
              reservedBudget: admin.firestore.FieldValue.increment(-reservedAmount),
              budget: admin.firestore.FieldValue.increment(reservedAmount),
            })
          }
        }
      }
    })

    await runSubmissionProofCleanupIfDue(admin, dbAdmin)

    if (strikeEmailPayload.current) {
      sendEarnerStrikeEmail(strikeEmailPayload.current).catch((error) => {
        console.error('Failed to send earner strike email', error)
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[advertiser-submission-review] error', error)
    const message = error instanceof Error ? error.message : 'Failed to review submission'
    const status = message.includes('Unauthorized')
      ? 401
      : message.includes('not found')
        ? 404
        : message.includes('only review submissions for your own tasks')
          ? 403
          : 400
    return NextResponse.json({ success: false, message }, { status })
  }
}
