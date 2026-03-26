import { NextRequest, NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { getAuth } from 'firebase-admin/auth'

/**
 * DELETE /api/advertiser/tasks/[id]/delete
 * Deletes a task and refunds unused budget to advertiser balance
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params before accessing
    const { id: taskId } = await params

    const { admin: adminSdk } = await initFirebaseAdmin()
    if (!adminSdk) {
      return NextResponse.json({ success: false, message: 'Firebase not initialized' }, { status: 500 })
    }

    // Get auth token from request
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    let userId: string
    try {
      const decodedToken = await getAuth(adminSdk.app()).verifyIdToken(token)
      userId = decodedToken.uid
    } catch (err) {
      console.error('Token verification failed', err)
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    const db = adminSdk.firestore()
    const campaignRef = db.collection('campaigns').doc(taskId)
    const advertiserRef = db.collection('advertisers').doc(userId)

    // Use transaction to ensure atomicity
    await db.runTransaction(async (transaction) => {
      const campaignSnap = await transaction.get(campaignRef)
      const advertiserSnap = await transaction.get(advertiserRef)

      if (!campaignSnap.exists) {
        throw new Error('Task not found')
      }

      const campaign = campaignSnap.data()
      
      // Log for debugging
      console.log('[delete-task][advertiser] campaign data:', {
        taskId,
        campaign_ownerId: campaign?.ownerId,
        campaign_advertiserId: campaign?.advertiserId,
        userId,
      })
      
      // Verify ownership - only advertiser who created it can delete
      // Campaigns use 'ownerId' field
      const isOwner = campaign?.ownerId === userId || campaign?.advertiserId === userId
      if (!isOwner) {
        throw new Error(`Unauthorized: not task owner (campaign owner: ${campaign?.ownerId || campaign?.advertiserId}, your id: ${userId})`)
      }

      if (campaign?.status === 'Deleted') {
        throw new Error('Task has already been deleted')
      }

      const pendingSubmissionsSnap = await transaction.get(
        db.collection('earnerSubmissions')
          .where('campaignId', '==', taskId)
          .where('status', '==', 'Pending')
      )
      const pendingReservedAmount = pendingSubmissionsSnap.docs.reduce(
        (sum, submissionDoc) => sum + Number(submissionDoc.data()?.reservedAmount || 0),
        0
      )
      const reservedBudget = Math.max(
        Number(campaign?.reservedBudget || 0),
        pendingReservedAmount
      )
      const refundableBudget = Math.max(0, Number(campaign?.budget || 0))

      console.log('[delete-task][advertiser]', {
        taskId,
        userId,
        totalBudget: campaign?.originalBudget || 0,
        refundableBudget,
        pendingReservedAmount,
        reservedBudget,
        currentBalance: advertiserSnap.data()?.balance || 0,
      })

      // Refund unused budget to advertiser balance
      if (refundableBudget > 0) {
        transaction.update(advertiserRef, {
          balance: adminSdk.firestore.FieldValue.increment(refundableBudget),
        })

        // Log transaction
        const txRef = db.collection('advertiserTransactions').doc()
        transaction.set(txRef, {
          userId,
          type: 'task_refund',
          amount: refundableBudget,
          status: 'completed',
          reference: taskId,
          note: pendingReservedAmount > 0
            ? `Partial refund for deleted task with pending submissions: ${campaign?.title || 'Unknown'}`
            : `Refund for deleted task: ${campaign?.title || 'Unknown'}`,
          createdAt: adminSdk.firestore.FieldValue.serverTimestamp(),
        })
      }

      // Preserve the campaign document so admin links and history remain valid.
      transaction.update(campaignRef, {
        status: 'Deleted',
        budget: 0,
        reservedBudget,
        deletedAt: adminSdk.firestore.FieldValue.serverTimestamp(),
        deletedBy: userId,
      })

      console.log('[delete-task][advertiser] completed', {
        taskId,
        refunded: refundableBudget,
        pendingReservedAmount,
      })
    })

    return NextResponse.json({
      success: true,
      message: 'Task deleted and budget refunded',
    })
  } catch (error) {
    console.error('[delete-task][advertiser] error', error)
    return NextResponse.json(
      { success: false, message: (error as Error).message || 'Failed to delete task' },
      { status: error instanceof Error && error.message === 'Unauthorized: not task owner' ? 403 : 500 }
    )
  }
}
