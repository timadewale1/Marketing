import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

function timestampToMillis(value: unknown): number {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().getTime()
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    return Number((value as { seconds?: number }).seconds || 0) * 1000
  }
  return 0
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    const { submissionId, reason } = await req.json()
    const normalizedSubmissionId = String(submissionId || '').trim()
    const normalizedReason = String(reason || '').trim()

    if (!normalizedSubmissionId) {
      return NextResponse.json({ success: false, message: 'Submission is required' }, { status: 400 })
    }
    if (normalizedReason.length < 10) {
      return NextResponse.json({ success: false, message: 'Please explain clearly why this proof should be reviewed.' }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })
    }

    const decoded = await admin.auth().verifyIdToken(authHeader.slice(7))
    const advertiserId = decoded.uid
    const db = dbAdmin as import('firebase-admin').firestore.Firestore
    const now = new Date()
    const reviewDueAt = new Date(now.getTime() + 12 * 60 * 60 * 1000)
    const submissionRef = db.collection('earnerSubmissions').doc(normalizedSubmissionId)

    await db.runTransaction(async (transaction) => {
      const advertiserRef = db.collection('advertisers').doc(advertiserId)
      const advertiserSnap = await transaction.get(advertiserRef)
      const advertiser = advertiserSnap.data() || {}
      if (advertiser.flaggingRestricted === true) {
        throw new Error('Your flagging access is currently limited. Please contact admin for review.')
      }

      const submissionSnap = await transaction.get(submissionRef)
      if (!submissionSnap.exists) {
        throw new Error('Submission not found')
      }

      const submission = submissionSnap.data() || {}
      if (String(submission.advertiserId || '') !== advertiserId) {
        throw new Error('You can only flag submissions for your own tasks')
      }
      if (String(submission.status || '') !== 'Pending') {
        throw new Error('Only pending submissions can be flagged')
      }
      if (String(submission.advertiserFlagStatus || '') === 'pending') {
        throw new Error('This submission has already been flagged for admin review')
      }

      const createdAtMs = timestampToMillis(submission.createdAt)
      const flagWindowEndsAtMs = timestampToMillis(submission.advertiserFlagWindowEndsAt) || (createdAtMs ? createdAtMs + 12 * 60 * 60 * 1000 : 0)
      if (flagWindowEndsAtMs > 0 && now.getTime() > flagWindowEndsAtMs) {
        throw new Error('The 12-hour advertiser flag window has closed. Admin decision is now final.')
      }

      transaction.update(submissionRef, {
        advertiserFlagStatus: 'pending',
        advertiserFlagReason: normalizedReason,
        advertiserFlaggedAt: now,
        advertiserFlaggedBy: advertiserId,
        advertiserFlagReviewDueAt: reviewDueAt,
        updatedAt: now,
      })

      transaction.set(advertiserRef, {
        submissionFlagsRaised: admin.firestore.FieldValue.increment(1),
        lastSubmissionFlaggedAt: now,
      }, { merge: true })

      const noteRef = db.collection('adminNotifications').doc()
      transaction.set(noteRef, {
        type: 'submission_flagged',
        title: 'Advertiser flagged a submission',
        body: `${String(submission.campaignTitle || 'A task')} was flagged for review: ${normalizedReason}`,
        link: '/admin/submissions',
        advertiserId,
        userId: submission.userId || null,
        submissionId: normalizedSubmissionId,
        campaignId: submission.campaignId || null,
        read: false,
        createdAt: now,
      })
    })

    return NextResponse.json({ success: true, message: 'Submission flagged for admin review' })
  } catch (error) {
    console.error('[advertiser-submission-flag] error', error)
    const message = error instanceof Error ? error.message : 'Failed to flag submission'
    const status = message.includes('Unauthorized') ? 401 : message.includes('not found') ? 404 : 400
    return NextResponse.json({ success: false, message }, { status })
  }
}
