import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

type CampaignDoc = {
  title?: string
  category?: string
  advertiserName?: string
  ownerId?: string
  status?: string
  budget?: number | string
  costPerLead?: number | string
  dailyLimit?: number | string
}

type SubmissionDoc = {
  campaignId?: string
  createdAt?: { toDate?: () => Date; seconds?: number } | null
}

type EarnerDoc = {
  status?: string
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Missing Authorization token' }, { status: 401 })
    }

    const idToken = authHeader.slice('Bearer '.length)
    const body = await req.json()
    const {
      campaignId,
      proofUrl,
      proofUrls,
      note,
      socialHandle,
    } = body || {}

    const normalizedProofUrls = Array.isArray(proofUrls)
      ? proofUrls.map((value: unknown) => String(value || '').trim()).filter(Boolean).slice(0, 5)
      : String(proofUrl || '').trim()
        ? [String(proofUrl).trim()]
        : []

    if (!campaignId || normalizedProofUrls.length === 0) {
      return NextResponse.json({ success: false, message: 'Missing submission details' }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })
    }

    const decoded = await admin.auth().verifyIdToken(idToken)
    const userId = decoded.uid
    const db = dbAdmin

    const earnerRef = db.collection('earners').doc(userId)
    const earnerSnap = await earnerRef.get()
    if (!earnerSnap.exists) {
      return NextResponse.json({ success: false, message: 'Earner profile not found' }, { status: 404 })
    }

    const earner = earnerSnap.data() as EarnerDoc
    if (String(earner?.status || '').toLowerCase() === 'suspended') {
      return NextResponse.json({ success: false, message: 'Your account is suspended. Please contact admin for review.' }, { status: 403 })
    }

    const campaignRef = db.collection('campaigns').doc(String(campaignId))
    const campaignSnap = await campaignRef.get()
    if (!campaignSnap.exists) {
      return NextResponse.json({ success: false, message: 'Task not found or has been removed' }, { status: 404 })
    }

    const campaign = campaignSnap.data() as CampaignDoc
    if (campaign.status !== 'Active') {
      return NextResponse.json({ success: false, message: 'This task is no longer active' }, { status: 400 })
    }

    const costPerLead = Number(campaign.costPerLead || 0)
    const fullAmount = costPerLead
    const earnerPrice = Math.round(costPerLead / 2)
    if (!fullAmount || Number(campaign.budget || 0) < fullAmount) {
      return NextResponse.json({ success: false, message: 'Task budget has been depleted' }, { status: 400 })
    }

    const userSubmissionsSnap = await db.collection('earnerSubmissions')
      .where('userId', '==', userId)
      .limit(500)
      .get()
    const alreadySubmitted = userSubmissionsSnap.docs.some((doc) => {
      const data = doc.data() as SubmissionDoc
      return String(data.campaignId || '') === String(campaignId)
    })
    if (alreadySubmitted) {
      return NextResponse.json({ success: false, message: 'You have already participated in this task' }, { status: 409 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayTime = today.getTime()
    const todayCount = userSubmissionsSnap.docs.filter((doc) => {
      const data = doc.data() as SubmissionDoc
      const createdAt = data.createdAt
      if (!createdAt) return false
      if (createdAt.toDate && typeof createdAt.toDate === 'function') {
        return createdAt.toDate().getTime() >= todayTime
      }
      if (typeof createdAt.seconds === 'number') {
        return createdAt.seconds * 1000 >= todayTime
      }
      return false
    }).length

    if (todayCount >= Number(campaign.dailyLimit || Infinity)) {
      return NextResponse.json({ success: false, message: "You've reached the daily submission limit" }, { status: 400 })
    }

    let createdSubmissionId = ''
    const flagWindowEndsAt = new Date(Date.now() + 12 * 60 * 60 * 1000)
    await db.runTransaction(async (transaction) => {
      const freshCampaignSnap = await transaction.get(campaignRef)
      if (!freshCampaignSnap.exists) {
        throw new Error('Task not found during reservation')
      }

      const freshCampaign = freshCampaignSnap.data() as CampaignDoc
      const available = Number(freshCampaign.budget || 0)
      if (freshCampaign.status !== 'Active') {
        throw new Error('This task is no longer active')
      }
      if (available < fullAmount) {
        throw new Error('Insufficient campaign budget to reserve funds')
      }

      const submissionRef = db.collection('earnerSubmissions').doc()
      createdSubmissionId = submissionRef.id

      transaction.update(campaignRef, {
        budget: admin.firestore.FieldValue.increment(-fullAmount),
        reservedBudget: admin.firestore.FieldValue.increment(fullAmount),
      })

      transaction.set(submissionRef, {
        userId,
        campaignId: String(campaignId),
        campaignTitle: freshCampaign.title || null,
        advertiserName: freshCampaign.advertiserName || null,
        advertiserId: freshCampaign.ownerId || null,
        category: freshCampaign.category || null,
        note: note || null,
        socialHandle: socialHandle || null,
        proofUrl: normalizedProofUrls[0],
        proofUrls: normalizedProofUrls,
        status: 'Pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        earnerPrice,
        reservedAmount: fullAmount,
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: null,
        advertiserFlagStatus: 'none',
        advertiserFlagReason: null,
        advertiserFlaggedAt: null,
        advertiserFlagReviewDueAt: null,
        advertiserFlagWindowEndsAt: flagWindowEndsAt,
      })

      const noteRef = db.collection('adminNotifications').doc()
      transaction.set(noteRef, {
        type: 'submission_created',
        title: 'New task submission',
        body: `${String(freshCampaign.title || 'A campaign')} has a new submission from ${userId}`,
        link: '/admin/submissions',
        userId,
        submissionId: submissionRef.id,
        campaignId: String(campaignId),
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    })

    return NextResponse.json({ success: true, submissionId: createdSubmissionId })
  } catch (err) {
    console.error('Earner submission create error:', err)
    const message = err instanceof Error ? err.message : 'Failed to submit participation'
    const status =
      message === 'Task not found during reservation' ? 404 :
      message === 'This task is no longer active' ? 400 :
      message === 'Insufficient campaign budget to reserve funds' ? 400 :
      500
    return NextResponse.json({ success: false, message }, { status })
  }
}
