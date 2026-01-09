import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const val = cookieStore.get('adminSession')?.value
    if (val !== '1') return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 })

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) return NextResponse.json({ ok: false, message: 'no admin db' }, { status: 500 })

    const now = Date.now()
    const fiveMinutes = 1000 * 60 * 5
    const cutoff = admin.firestore.Timestamp.fromMillis(now - fiveMinutes)

    const q = dbAdmin.collection('earnerSubmissions')
      .where('status', '==', 'Pending')
      .where('createdAt', '<=', cutoff)
      .limit(200)

    const snap = await q.get()
    if (snap.empty) return NextResponse.json({ ok: true, processed: 0 })

    let processed = 0
    for (const sDoc of snap.docs) {
      try {
        await dbAdmin.runTransaction(async (t) => {
          const subRef = sDoc.ref
          const subSnap = await t.get(subRef)
          if (!subSnap.exists) return
          const submission = subSnap.data() as Record<string, any>
          if ((submission.status || '') !== 'Pending') return

          let earnerAmount = Number(submission.earnerPrice || 0)
          const campaignId = submission.campaignId
          let campaign: Record<string, any> | null = null
          if ((!earnerAmount || earnerAmount === 0) && campaignId) {
            const cSnap = await t.get(dbAdmin.collection('campaigns').doc(campaignId))
            if (cSnap.exists) {
              campaign = cSnap.data() || null
              const costPerLead = Number(campaign?.costPerLead || 0)
              earnerAmount = Math.round(costPerLead / 2) || 0
            }
          } else if (campaignId) {
            const cSnap = await t.get(dbAdmin.collection('campaigns').doc(campaignId))
            if (cSnap.exists) campaign = cSnap.data() || null
          }

          const fullAmount = earnerAmount * 2
          const reservedOnSubmission = Number(submission.reservedAmount || 0)

          if (campaign && reservedOnSubmission > 0) {
            const reservedBudget = Number(campaign.reservedBudget || 0)
            if (reservedBudget < reservedOnSubmission) {
              throw new Error('Insufficient reserved budget for auto-verify')
            }
          }

          const nowTimestamp = admin.firestore.FieldValue.serverTimestamp()

          t.update(subRef, {
            status: 'Verified',
            reviewedAt: nowTimestamp,
            autoVerified: true,
          })

          if (campaignId && campaign) {
            const campaignRef = dbAdmin.collection('campaigns').doc(campaignId)
            const completedLeads = Number(campaign.generatedLeads || 0) + 1
            const estimated = Number(campaign.estimatedLeads || 0)
            const completionRate = estimated > 0 ? (completedLeads / estimated) * 100 : 0

            const campaignUpdates: Record<string, any> = {
              generatedLeads: admin.firestore.FieldValue.increment(1),
              completedLeads: admin.firestore.FieldValue.increment(1),
              lastLeadAt: nowTimestamp,
              completionRate,
              dailySubmissionCount: admin.firestore.FieldValue.increment(1),
            }
            if (reservedOnSubmission > 0) {
              campaignUpdates.reservedBudget = admin.firestore.FieldValue.increment(-reservedOnSubmission)
            } else {
              campaignUpdates.budget = admin.firestore.FieldValue.increment(-fullAmount)
            }
            if (completionRate >= 100) campaignUpdates.status = 'Completed'
            t.update(campaignRef, campaignUpdates)
          }

          if (earnerAmount > 0 && submission.userId) {
            const earnerTxRef = dbAdmin.collection('earnerTransactions').doc()
            t.set(earnerTxRef, {
              userId: submission.userId,
              campaignId: campaignId || null,
              type: 'credit',
              amount: earnerAmount,
              status: 'completed',
              note: `Auto-verified campaign submission ${sDoc.id}`,
              createdAt: nowTimestamp,
            })
            t.update(dbAdmin.collection('earners').doc(submission.userId), {
              balance: admin.firestore.FieldValue.increment(earnerAmount),
              leadsPaidFor: admin.firestore.FieldValue.increment(1),
              totalEarned: admin.firestore.FieldValue.increment(earnerAmount),
              lastEarnedAt: nowTimestamp,
            })
          }

          const advertiserId = submission.advertiserId || (campaign && campaign.ownerId)
          if (advertiserId) {
            const advTxRef = dbAdmin.collection('advertiserTransactions').doc()
            t.set(advTxRef, {
              userId: advertiserId,
              campaignId: campaignId || null,
              type: 'debit',
              amount: fullAmount,
              status: 'completed',
              note: `Auto-payment for lead in ${submission.campaignTitle || ''}`,
              createdAt: nowTimestamp,
            })
            t.update(dbAdmin.collection('advertisers').doc(advertiserId), {
              totalSpent: admin.firestore.FieldValue.increment(fullAmount),
              leadsGenerated: admin.firestore.FieldValue.increment(1),
              lastLeadAt: nowTimestamp,
            })
          }
        })
        processed += 1
      } catch (err) {
        console.error('Auto-verify submission error for', sDoc.id, err)
      }
    }

    return NextResponse.json({ ok: true, processed })
  } catch (err) {
    console.error('auto-verify API error', err)
    return NextResponse.json({ ok: false, message: 'error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, message: 'POST to run auto-verify' })
}
