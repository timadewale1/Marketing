import { NextRequest, NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { getAuth } from 'firebase-admin/auth'

/**
 * DELETE /api/admin/tasks/[id]/delete
 * Admin can delete a task and refund unused budget to advertiser balance
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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

    const taskId = params.id
    const campaignRef = db.collection('campaigns').doc(taskId)

    // Use transaction to ensure atomicity
    await db.runTransaction(async (transaction) => {
      const campaignSnap = await transaction.get(campaignRef)

      if (!campaignSnap.exists) {
        throw new Error('Task not found')
      }

      const campaign = campaignSnap.data()
      const advertiserId = campaign?.advertiserId as string | undefined

      if (!advertiserId) {
        throw new Error('Task has no advertiser ID')
      }

      const advertiserRef = db.collection('advertisers').doc(advertiserId)

      // Calculate unused budget
      const unusedBudget = Number(campaign?.budget || 0) + Number(campaign?.reservedBudget || 0)

      console.log('[delete-task][admin]', {
        taskId,
        adminId: userId,
        advertiserId,
        totalBudget: campaign?.originalBudget || 0,
        unusedBudget,
      })

      // Refund unused budget to advertiser balance
      if (unusedBudget > 0) {
        transaction.update(advertiserRef, {
          balance: adminSdk.firestore.FieldValue.increment(unusedBudget),
        })

        // Log transaction
        const txRef = db.collection('advertiserTransactions').doc()
        transaction.set(txRef, {
          userId: advertiserId,
          type: 'task_refund_admin',
          amount: unusedBudget,
          status: 'completed',
          reference: taskId,
          note: `Refund for task deleted by admin: ${campaign?.title || 'Unknown'}`,
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
        refundedAmount: unusedBudget,
        taskTitle: campaign?.title,
        createdAt: adminSdk.firestore.FieldValue.serverTimestamp(),
      })

      // Delete the campaign
      transaction.delete(campaignRef)

      console.log('[delete-task][admin] completed', { taskId, refunded: unusedBudget })
    })

    return NextResponse.json({
      success: true,
      message: 'Task deleted and budget refunded to advertiser',
    })
  } catch (error) {
    console.error('[delete-task][admin] error', error)
    return NextResponse.json(
      { success: false, message: (error as Error).message || 'Failed to delete task' },
      { status: 500 }
    )
  }
}
