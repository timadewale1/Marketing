import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

// Firebase types
type AdminModule = typeof import('firebase-admin')
type Firestore = import('firebase-admin').firestore.Firestore
type FirestoreFieldValue = import('firebase-admin').firestore.FieldValue

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

export async function POST(req: Request) {
  const { action, rejectionReason, submissionId } = await req.json()
  const { getAuth } = await import('firebase-admin/auth')
  const firebaseAdmin = await initFirebaseAdmin()
  if (!firebaseAdmin || !firebaseAdmin.dbAdmin) {
    return NextResponse.json({ success: false, message: 'Firebase not initialized' }, { status: 500 })
  }
  const adminDb = firebaseAdmin.dbAdmin
  const admin = await import('firebase-admin')
  const now = new Date()
  const adminAuth = getAuth()
  const adminUid = req.headers.get('x-admin-uid') || 'system'

  try {
    const subRef = adminDb.collection('submissions').doc(submissionId)
    const subSnap = await subRef.get()
    if (!subSnap.exists) {
      return NextResponse.json({ success: false, message: 'Submission not found' }, { status: 404 })
    }
    const submission = subSnap.data() as Submission
    const prevStatus = submission.status

    await adminDb.runTransaction(async (t) => {
      if (action === 'Verified') {
        if (prevStatus === 'Verified') return // idempotent

        // Fetch campaign
        const campaignId = submission.campaignId as string | undefined
        if (!campaignId) throw new Error('Submission missing campaignId')
        const campaignRef = adminDb.collection('campaigns').doc(campaignId)
        const campaignSnap = await t.get(campaignRef)
        if (!campaignSnap.exists) {
          throw new Error('Campaign not found')
        }
        const campaign = campaignSnap.data() as Campaign
        const campaignBudget = Number(campaign.budget || 0)
        const earnerAmount = Number(submission.earnerPrice || 0)
        const fullAmount = earnerAmount * 2

        if (campaignBudget < fullAmount) {
          throw new Error('Insufficient campaign budget')
        }

        const advertiserId = submission.advertiserId || campaign.ownerId

        // 1) Update submission (add updatedAt to ensure clients pick up change)
        t.update(subRef, {
          status: 'Verified',
          reviewedAt: now,
          reviewedBy: adminUid,
          rejectionReason: null,
          updatedAt: now,
        })

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
        if (Number(submission.reservedAmount || 0) > 0) {
          campaignUpdates.reservedBudget = admin.firestore.FieldValue.increment(-Number(submission.reservedAmount || 0))
        } else {
          campaignUpdates.budget = admin.firestore.FieldValue.increment(-fullAmount)
        }
        if (completionRate >= 100) campaignUpdates.status = 'Completed'
        // add lastUpdated so clients observing campaigns detect changes
        campaignUpdates.lastUpdated = now
        t.update(campaignRef, campaignUpdates)

        // 3) Earner transaction + balance
        const userId = submission.userId as string
        if (!userId) throw new Error('Submission missing userId')
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
        t.update(adminDb.collection('earners').doc(userId), {
          balance: admin.firestore.FieldValue.increment(earnerAmount),
          leadsPaidFor: admin.firestore.FieldValue.increment(1),
          totalEarned: admin.firestore.FieldValue.increment(earnerAmount),
          lastEarnedAt: now,
        })

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
          t.update(adminDb.collection('advertisers').doc(advertiserId), {
            totalSpent: admin.firestore.FieldValue.increment(fullAmount),
            leadsGenerated: admin.firestore.FieldValue.increment(1),
            lastLeadAt: now,
          })
        }
      } else if (action === 'Rejected') {
        if (prevStatus === 'Rejected') return // idempotent

        // If previously verified, reverse funds
        const wasVerified = prevStatus === 'Verified'
        const campaignId = submission.campaignId

        // Update submission with rejection metadata
        t.update(subRef, {
          status: 'Rejected',
          reviewedAt: now,
          reviewedBy: adminUid,
          rejectionReason: rejectionReason || null,
        })

        // compute earnerAmount/fullAmount (prefer submission, fall back to campaign costPerLead)
        let earnerAmount = Number(submission.earnerPrice || 0)
        let fullAmount = earnerAmount * 2
        if ((!earnerAmount || earnerAmount === 0) && campaignId) {
          const cSnapTmp = await t.get(adminDb.collection('campaigns').doc(campaignId))
          if (cSnapTmp.exists) {
              const cDataTmp = cSnapTmp.data() as Campaign
              const costPerLeadTmp = Number(cDataTmp.costPerLead || 0)
            if (costPerLeadTmp > 0) earnerAmount = Math.round(costPerLeadTmp / 2)
            fullAmount = Number(submission.reservedAmount || earnerAmount * 2)
          }
        }

        if (wasVerified && earnerAmount > 0) {
          if (!campaignId) throw new Error('Submission missing campaignId')
          interface Campaign {
            budget?: number | string
            estimatedLeads?: number | string
            generatedLeads?: number | string
            ownerId?: string
            status?: string
          }

          const campaignRef = adminDb.collection('campaigns').doc(campaignId)
          const campaignSnap = await t.get(campaignRef)
          const campaign = campaignSnap.exists ? campaignSnap.data() as Campaign : null

          const advertiserId = submission.advertiserId || campaign?.ownerId

          // 1) Add reversal transaction for earner and decrement balance
          const userId = submission.userId as string
          if (!userId) throw new Error('Submission missing userId')
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
            const reservedAmt = Number(submission.reservedAmount || 0)
            if (reservedAmt > 0) {
              t.update(campaignRef, {
                generatedLeads: admin.firestore.FieldValue.increment(-1),
                reservedBudget: admin.firestore.FieldValue.increment(-reservedAmt),
                budget: admin.firestore.FieldValue.increment(reservedAmt),
                completedLeads: admin.firestore.FieldValue.increment(-1),
              })
            } else {
              t.update(campaignRef, {
                generatedLeads: admin.firestore.FieldValue.increment(-1),
                budget: admin.firestore.FieldValue.increment(fullAmount),
                completedLeads: admin.firestore.FieldValue.increment(-1),
              })
            }
          }
      }
      // If the submission was not previously verified, we must release reserved funds (reservation created at submission time)
      if (!wasVerified && campaignId) {
        const campaignRef2 = adminDb.collection('campaigns').doc(campaignId)
        const reservedAmt = Number(submission.reservedAmount || 0)
        if (reservedAmt > 0) {
          t.update(campaignRef2, {
            reservedBudget: admin.firestore.FieldValue.increment(-reservedAmt),
            budget: admin.firestore.FieldValue.increment(reservedAmt),
          })
        }
      }
      } else {
        throw new Error('Unknown action')
      }
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Submission review error:', err)
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
