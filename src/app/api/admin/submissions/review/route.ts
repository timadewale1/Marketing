import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  try {
    const { submissionId, action, rejectionReason } = await req.json()

    if (!submissionId || !action) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 })
    }

    // verify admin via Authorization Bearer <idToken>
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Missing Authorization token' }, { status: 401 })
    }
    const idToken = authHeader.split('Bearer ')[1]

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })

    const adminDb = dbAdmin

    // verify token and admin status
    let adminUid: string
    try {
      const decoded = await admin.auth().verifyIdToken(idToken)
      adminUid = decoded.uid
    } catch (err) {
      console.error('Invalid ID token', err)
      return NextResponse.json({ success: false, message: 'Invalid ID token' }, { status: 401 })
    }

    const adminSnap = await adminDb.collection('admins').doc(adminUid).get()
    if (!adminSnap.exists) {
      return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 })
    }

    // perform atomic review in a transaction
    await adminDb.runTransaction(async (t) => {
      interface Submission {
        status?: string
        earnerPrice?: number | string
        campaignId: string
        advertiserId?: string
        userId: string
        campaignTitle: string
        reservedAmount?: number | string
      }

      const subRef = adminDb.collection('earnerSubmissions').doc(submissionId)
      const subSnap = await t.get(subRef)
      if (!subSnap.exists) throw new Error('Submission not found')
      const submission = subSnap.data() as Submission

      const prevStatus = submission.status || ''
      const now = admin.firestore.FieldValue.serverTimestamp()

      if (action === 'Verified') {
        if (prevStatus === 'Verified') return // idempotent

        const amount = Number(submission.earnerPrice || 0)
        const fullAmount = amount * 2
        const campaignId = submission.campaignId

        interface Campaign {
          budget?: number | string
          estimatedLeads?: number | string
          generatedLeads?: number | string
          ownerId?: string
          status?: string
          reservedBudget?: number | string
        }

        const campaignRef = adminDb.collection('campaigns').doc(campaignId)
        const campaignSnap = await t.get(campaignRef)
        if (!campaignSnap.exists) throw new Error('Campaign not found')
        const campaign = campaignSnap.data() as Campaign

        // Prefer reservedAmount on the submission (created at submission time)
        const reservedOnSubmission = Number(submission.reservedAmount || 0)
        // If funds were reserved at submission time, ensure reservation exists; otherwise fall back to checking campaign budget
        if (reservedOnSubmission > 0) {
          // ensure campaign has enough reservedBudget
          const reservedBudget = Number(campaign.reservedBudget || 0)
          if (reservedBudget < reservedOnSubmission) {
            throw new Error('Insufficient reserved budget for this campaign')
          }
        } else {
          const campaignBudget = Number(campaign.budget || 0)
          if (campaignBudget < fullAmount) {
            throw new Error('Insufficient campaign budget')
          }
        }

        const advertiserId = submission.advertiserId || campaign.ownerId

        // 1) Update submission
        t.update(subRef, {
          status: 'Verified',
          reviewedAt: now,
          reviewedBy: adminUid,
          rejectionReason: null,
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
        t.update(campaignRef, campaignUpdates)

        // 3) Earner transaction + balance
        const earnerTxRef = adminDb.collection('earnerTransactions').doc()
        t.set(earnerTxRef, {
          userId: submission.userId,
          campaignId,
          type: 'credit',
          amount,
          status: 'completed',
          note: `Payment for ${submission.campaignTitle}`,
          createdAt: now,
        })
        t.update(adminDb.collection('earners').doc(submission.userId), {
          balance: admin.firestore.FieldValue.increment(amount),
          leadsPaidFor: admin.firestore.FieldValue.increment(1),
          totalEarned: admin.firestore.FieldValue.increment(amount),
          lastEarnedAt: now,
        })

        // 4) Advertiser transaction + stats
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
        const amount = Number(submission.earnerPrice || 0)
        const fullAmount = amount * 2
        const campaignId = submission.campaignId

        // Update submission with rejection metadata
        t.update(subRef, {
          status: 'Rejected',
          reviewedAt: now,
          reviewedBy: adminUid,
          rejectionReason: rejectionReason || null,
        })

        if (wasVerified && amount > 0) {
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
          const earnerRevRef = adminDb.collection('earnerTransactions').doc()
          t.set(earnerRevRef, {
            userId: submission.userId,
            campaignId,
            type: 'reversal',
            amount: -amount,
            status: 'completed',
            note: `Reversal for rejected submission ${submission.campaignTitle}`,
            createdAt: now,
          })
          t.update(adminDb.collection('earners').doc(submission.userId), {
            balance: admin.firestore.FieldValue.increment(-amount),
            leadsPaidFor: admin.firestore.FieldValue.increment(-1),
            totalEarned: admin.firestore.FieldValue.increment(-amount),
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
        if (!wasVerified) {
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
