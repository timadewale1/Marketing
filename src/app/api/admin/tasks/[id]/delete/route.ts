import { NextRequest, NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { getAuth } from 'firebase-admin/auth'

/**
 * DELETE /api/admin/tasks/[id]/delete
 * Admin can delete a task and refund unused budget to advertiser balance
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

    // Verify admin role
    const db = adminSdk.firestore()
    const adminDoc = await db.collection('admins').doc(userId).get()
    if (!adminDoc.exists) {
      return NextResponse.json({ success: false, message: 'Admin access required' }, { status: 403 })
    }

    const campaignRef = db.collection('campaigns').doc(taskId)

    // Use transaction to ensure atomicity
    await db.runTransaction(async (transaction) => {
      const campaignSnap = await transaction.get(campaignRef)

      if (!campaignSnap.exists) {
        throw new Error('Task not found')
      }

      const campaign = campaignSnap.data()
      const advertiserId = campaign?.ownerId as string | undefined

      if (!advertiserId) {
        throw new Error('Task has no owner ID')
      }

      const advertiserRef = db.collection('advertisers').doc(advertiserId)

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

      console.log('[delete-task][admin]', {
        taskId,
        adminId: userId,
        advertiserId,
        totalBudget: campaign?.originalBudget || 0,
        refundableBudget,
        pendingReservedAmount,
        reservedBudget,
      })

      // Refund unused budget to advertiser balance
      if (refundableBudget > 0) {
        transaction.update(advertiserRef, {
          balance: adminSdk.firestore.FieldValue.increment(refundableBudget),
        })

        // Log transaction
        const txRef = db.collection('advertiserTransactions').doc()
        transaction.set(txRef, {
          userId: advertiserId,
          type: 'task_refund_admin',
          amount: refundableBudget,
          status: 'completed',
          reference: taskId,
          note: pendingReservedAmount > 0
            ? `Partial refund for admin-deleted task with pending submissions: ${campaign?.title || 'Unknown'}`
            : `Refund for task deleted by admin: ${campaign?.title || 'Unknown'}`,
          createdAt: adminSdk.firestore.FieldValue.serverTimestamp(),
        })
      }

      // Log admin action
      const adminLogRef = db.collection('adminLogs').doc()
      transaction.set(adminLogRef, {
        adminId: userId,
        action: 'delete_task',
        taskId,
        advertiserId,
        refundedAmount: refundableBudget,
        pendingReservedAmount,
        taskTitle: campaign?.title,
        createdAt: adminSdk.firestore.FieldValue.serverTimestamp(),
      })

      // Preserve the campaign document so admin links and history remain valid.
      transaction.update(campaignRef, {
        status: 'Deleted',
        budget: 0,
        reservedBudget,
        deletedAt: adminSdk.firestore.FieldValue.serverTimestamp(),
        deletedBy: userId,
      })

      console.log('[delete-task][admin] completed', {
        taskId,
        refunded: refundableBudget,
        pendingReservedAmount,
      })
    })

    return NextResponse.json({
      success: true,
      message: 'Task deleted and refundable budget returned to advertiser',
    })
  } catch (error) {
    console.error('[delete-task][admin] error', error)
    return NextResponse.json(
      { success: false, message: (error as Error).message || 'Failed to delete task' },
      { status: 500 }
    )
  }
}
