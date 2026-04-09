import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.slice(7)
    const { campaignId, amount } = await req.json()
    const normalizedCampaignId = String(campaignId || '').trim()
    const normalizedAmount = Number(amount || 0)

    if (!normalizedCampaignId) {
      return NextResponse.json({ success: false, message: 'Campaign is required' }, { status: 400 })
    }

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return NextResponse.json({ success: false, message: 'Enter a valid amount' }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })
    }

    const decoded = await admin.auth().verifyIdToken(token)
    const advertiserId = decoded.uid
    const db = dbAdmin as import('firebase-admin').firestore.Firestore

    await db.runTransaction(async (transaction) => {
      const advertiserRef = db.collection('advertisers').doc(advertiserId)
      const campaignRef = db.collection('campaigns').doc(normalizedCampaignId)
      const [advertiserSnap, campaignSnap] = await Promise.all([
        transaction.get(advertiserRef),
        transaction.get(campaignRef),
      ])

      if (!advertiserSnap.exists) {
        throw new Error('Advertiser profile not found')
      }

      if (!campaignSnap.exists) {
        throw new Error('Campaign not found')
      }

      const advertiser = advertiserSnap.data() || {}
      const campaign = campaignSnap.data() || {}

      if (String(campaign.ownerId || '') !== advertiserId) {
        throw new Error('You can only add budget to your own task')
      }

      if (String(campaign.status || '') === 'Deleted') {
        throw new Error('Deleted tasks cannot receive more budget')
      }

      const balance = Number(advertiser.balance || 0)
      if (balance < normalizedAmount) {
        throw new Error('Insufficient wallet balance')
      }

      const costPerLead = Number(campaign.costPerLead || 0)
      const additionalEstimatedLeads = costPerLead > 0 ? Math.floor(normalizedAmount / costPerLead) : 0

      transaction.update(advertiserRef, {
        balance: admin.firestore.FieldValue.increment(-normalizedAmount),
      })

      transaction.update(campaignRef, {
        budget: admin.firestore.FieldValue.increment(normalizedAmount),
        originalBudget: admin.firestore.FieldValue.increment(normalizedAmount),
        estimatedLeads: admin.firestore.FieldValue.increment(additionalEstimatedLeads),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        status: String(campaign.status || '') === 'Completed' ? 'Active' : campaign.status,
      })

      const txRef = db.collection('advertiserTransactions').doc()
      transaction.set(txRef, {
        userId: advertiserId,
        type: 'campaign_top_up',
        amount: -normalizedAmount,
        campaignId: normalizedCampaignId,
        campaignTitle: String(campaign.title || ''),
        status: 'completed',
        note: `Additional budget added to task: ${String(campaign.title || 'Untitled')}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    })

    return NextResponse.json({ success: true, message: 'Task budget updated successfully' })
  } catch (error) {
    console.error('[campaign-top-up] error', error)
    const message = error instanceof Error ? error.message : 'Failed to add budget'
    const status =
      message === 'Unauthorized'
        ? 401
        : message.toLowerCase().includes('not found')
          ? 404
          : 400
    return NextResponse.json({ success: false, message }, { status })
  }
}
