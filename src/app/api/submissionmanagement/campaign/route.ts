import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore'
import { requireSubmissionManagementSession } from '@/lib/submissionmanagement-session'

export async function POST(req: Request) {
  try {
    await requireSubmissionManagementSession()
    const { campaignId, action } = await req.json()

    if (!campaignId || !action) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 })
    }

    console.log('[SubmissionMgmt:Campaign] Initializing Firebase...')
    const { admin, dbAdmin } = await initFirebaseAdmin()
    console.log(`[SubmissionMgmt:Campaign] Firebase init result: admin=${!!admin}, dbAdmin=${!!dbAdmin}`)
    if (!dbAdmin || !admin) {
      console.error('[SubmissionMgmt:Campaign] Firebase initialization failed')
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

    const ownerId = String(campaign.ownerId || '').trim()
    if (!ownerId) {
      return NextResponse.json({ success: false, message: 'Missing campaign owner' }, { status: 400 })
    }

    const advertiserRef = adminDb.collection('advertisers').doc(ownerId)
    const vendorRef = adminDb.collection('vendors').doc(ownerId)
    const [advertiserSnap, vendorSnap] = await Promise.all([advertiserRef.get(), vendorRef.get()])
    const ownerRef = advertiserSnap.exists ? advertiserRef : (vendorSnap.exists ? vendorRef : null)
    const ownerTxCollection = advertiserSnap.exists ? 'advertiserTransactions' : (vendorSnap.exists ? 'vendorTransactions' : null)
    if (!ownerRef || !ownerTxCollection) {
      return NextResponse.json({ success: false, message: 'Campaign owner account not found' }, { status: 404 })
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
        const reservedBudget = Math.max(Number(campaign.reservedBudget || 0), pendingReservedAmount)
        const refundAmount = Math.max(0, Number(campaign.budget || 0))

        batch.update(campaignRef, {
          status: 'Deleted',
          deletedAt: admin.firestore.FieldValue.serverTimestamp(),
          budget: 0,
          reservedBudget,
        })

        batch.update(ownerRef, {
          campaignsCreated: admin.firestore.FieldValue.increment(-1),
        })

        if (refundAmount > 0) {
          batch.update(ownerRef, {
            balance: admin.firestore.FieldValue.increment(refundAmount),
          })

          const txRef = adminDb.collection(ownerTxCollection).doc()
          batch.set(txRef, {
            userId: ownerId,
            campaignId,
            campaignTitle: campaign.title,
            type: 'refund',
            amount: refundAmount,
            status: 'completed',
            note: pendingReservedAmount > 0
              ? `Partial refund from deleted campaign with pending submissions: ${campaign.title}`
              : `Refund from deleted campaign: ${campaign.title}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          })
        }
        break
      }
      case 'pause':
        batch.update(campaignRef, { status: 'Paused', pausedAt: admin.firestore.FieldValue.serverTimestamp() })
        break
      case 'activate':
        if (!campaign.budget || campaign.budget <= 0) {
          return NextResponse.json({ success: false, message: 'Insufficient campaign budget' }, { status: 400 })
        }
        batch.update(campaignRef, { status: 'Active', activatedAt: admin.firestore.FieldValue.serverTimestamp() })
        break
      case 'stop': {
        if (campaign.budget > 0) {
          const refundAmount = campaign.budget
          batch.update(ownerRef, {
            balance: admin.firestore.FieldValue.increment(refundAmount),
          })

          const txRef = adminDb.collection(ownerTxCollection).doc()
          batch.set(txRef, {
            userId: ownerId,
            campaignId,
            campaignTitle: campaign.title,
            type: 'refund',
            amount: refundAmount,
            status: 'completed',
            note: `Refund from stopped campaign: ${campaign.title}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          })
        }

        batch.update(campaignRef, {
          status: 'Stopped',
          stoppedAt: admin.firestore.FieldValue.serverTimestamp(),
          budget: 0,
        })
        break
      }
      default:
        return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 })
    }

    await batch.commit()
    return NextResponse.json({ success: true, message: `Campaign ${action} successful` })
  } catch (error) {
    console.error('Submission management campaign action error:', error)
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 })
  }
}
