import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.slice(7)
    const { campaignId, title, description } = await req.json()
    const normalizedCampaignId = String(campaignId || '').trim()
    const normalizedTitle = String(title || '').trim()
    const normalizedDescription = String(description || '').trim()

    if (!normalizedCampaignId) {
      return NextResponse.json({ success: false, message: 'Campaign is required' }, { status: 400 })
    }

    if (!normalizedTitle) {
      return NextResponse.json({ success: false, message: 'Task name is required' }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })
    }

    const decoded = await admin.auth().verifyIdToken(token)
    const advertiserId = decoded.uid
    const db = dbAdmin as import('firebase-admin').firestore.Firestore

    const campaignRef = db.collection('campaigns').doc(normalizedCampaignId)
    await db.runTransaction(async (transaction) => {
      const campaignSnap = await transaction.get(campaignRef)
      if (!campaignSnap.exists) {
        throw new Error('Campaign not found')
      }

      const campaign = campaignSnap.data() || {}
      if (String(campaign.ownerId || '') !== advertiserId) {
        throw new Error('You can only edit your own task')
      }

      if (String(campaign.status || '') === 'Deleted') {
        throw new Error('Deleted tasks cannot be edited')
      }

      transaction.update(campaignRef, {
        title: normalizedTitle,
        description: normalizedDescription,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      })
    })

    return NextResponse.json({ success: true, message: 'Task details updated successfully' })
  } catch (error) {
    console.error('[campaign-update] error', error)
    const message = error instanceof Error ? error.message : 'Failed to update task'
    const status =
      message === 'Unauthorized'
        ? 401
        : message.toLowerCase().includes('not found')
          ? 404
          : 400
    return NextResponse.json({ success: false, message }, { status })
  }
}
