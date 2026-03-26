import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore'
import { requireAdminSession } from '@/lib/admin-session'

// Handle all campaign state transitions and financial implications
export async function POST(req: Request) {
  try {
    await requireAdminSession()
    const { campaignId, action } = await req.json()
    
    if (!campaignId || !action) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin || !admin) {
      return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })
    }

    const adminDb = dbAdmin as AdminFirestore
    const campaignRef = adminDb.collection('campaigns').doc(campaignId)
    const campaignSnap = await campaignRef.get()

    if (!campaignSnap.exists) {
      return NextResponse.json({ success: false, message: 'Campaign not found' }, { status: 404 })
    }

    const campaign = campaignSnap.data()
    if (!campaign) {
      return NextResponse.json({ success: false, message: 'Invalid campaign data' }, { status: 400 })
    }

    // Get advertiser reference for balance updates
    const advertiserId = campaign.ownerId
    if (!advertiserId) {
      return NextResponse.json({ success: false, message: 'Missing campaign owner' }, { status: 400 })
    }

    const advertiserRef = adminDb.collection('advertisers').doc(advertiserId)
    const advertiserSnap = await advertiserRef.get()

    if (!advertiserSnap.exists) {
      return NextResponse.json({ success: false, message: 'Advertiser not found' }, { status: 404 })
    }

    const batch = adminDb.batch()

    switch (action) {
      case 'delete': {
        const pendingSubmissionsSnap = await adminDb
          .collection('earnerSubmissions')
          .where('campaignId', '==', campaignId)
          .where('status', '==', 'Pending')
          .get()
        const pendingReservedAmount = pendingSubmissionsSnap.docs.reduce(
          (sum, submissionDoc) => sum + Number(submissionDoc.data()?.reservedAmount || 0),
          0
        )
        const reservedBudget = Math.max(
          Number(campaign.reservedBudget || 0),
          pendingReservedAmount
        )
        const refundAmount = Math.max(0, Number(campaign.budget || 0))

        // Mark campaign as deleted
        batch.update(campaignRef, { 
          status: 'Deleted',
          deletedAt: admin.firestore.FieldValue.serverTimestamp(),
          budget: 0,
          reservedBudget,
        })

        // Decrement advertiser campaign count
        batch.update(advertiserRef, {
          campaignsCreated: admin.firestore.FieldValue.increment(-1)
        })

        // Refund remaining budget to advertiser wallet
        if (refundAmount > 0) {
          batch.update(advertiserRef, {
            balance: admin.firestore.FieldValue.increment(refundAmount)
          })

          // Log refund transaction
          const txRef = adminDb.collection('advertiserTransactions').doc()
          batch.set(txRef, {
            userId: advertiserId,
            campaignId,
            campaignTitle: campaign.title,
            type: 'refund',
            amount: refundAmount,
            status: 'completed',
            note: pendingReservedAmount > 0
              ? `Partial refund from deleted campaign with pending submissions: ${campaign.title}`
              : `Refund from deleted campaign: ${campaign.title}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          })
        }
        break
      }

      case 'pause': {
        batch.update(campaignRef, { 
          status: 'Paused',
          pausedAt: admin.firestore.FieldValue.serverTimestamp()
        })
        break
      }

      case 'activate': {
        // Check if campaign has enough budget
        if (!campaign.budget || campaign.budget <= 0) {
          return NextResponse.json({ success: false, message: 'Insufficient campaign budget' }, { status: 400 })
        }

        batch.update(campaignRef, {
          status: 'Active',
          activatedAt: admin.firestore.FieldValue.serverTimestamp()
        })
        break
      }

      case 'stop': {
        // When stopping, refund remaining budget
        if (campaign.budget > 0) {
          const refundAmount = campaign.budget
          batch.update(advertiserRef, {
            balance: admin.firestore.FieldValue.increment(refundAmount)
          })

          // Log refund transaction
          const txRef = adminDb.collection('advertiserTransactions').doc()
          batch.set(txRef, {
            userId: advertiserId,
            campaignId,
            campaignTitle: campaign.title,
            type: 'refund',
            amount: refundAmount,
            status: 'completed',
            note: `Refund from stopped campaign: ${campaign.title}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          })
        }

        batch.update(campaignRef, {
          status: 'Stopped',
          stoppedAt: admin.firestore.FieldValue.serverTimestamp(),
          budget: 0 // Clear budget since it's refunded
        })
        break
      }

      default:
        return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 })
    }

    await batch.commit()

    return NextResponse.json({ success: true, message: `Campaign ${action} successful` })
  } catch (err) {
    console.error('Campaign action error:', err)
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 })
  }
}
