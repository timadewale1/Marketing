import { NextRequest, NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { getAuth } from 'firebase-admin/auth'

/**
 * DELETE /api/advertiser/tasks/[id]/delete
 * Deletes a task and refunds unused budget to advertiser balance
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

    const taskId = params.id
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
      
      // Verify ownership - only advertiser who created it can delete
      if (campaign?.advertiserId !== userId) {
        throw new Error('Unauthorized: not task owner')
      }

      // Calculate unused budget (available budget + reserved budget that wasn't used)
      const unusedBudget = Number(campaign?.budget || 0) + Number(campaign?.reservedBudget || 0)

      console.log('[delete-task][advertiser]', {
        taskId,
        userId,
        totalBudget: campaign?.originalBudget || 0,
        unusedBudget,
        currentBalance: advertiserSnap.data()?.balance || 0,
      })

      // Refund unused budget to advertiser balance
      if (unusedBudget > 0) {
        transaction.update(advertiserRef, {
          balance: adminSdk.firestore.FieldValue.increment(unusedBudget),
        })

        // Log transaction
        const txRef = db.collection('advertiserTransactions').doc()
        transaction.set(txRef, {
          userId,
          type: 'task_refund',
          amount: unusedBudget,
          status: 'completed',
          reference: taskId,
          note: `Refund for deleted task: ${campaign?.title || 'Unknown'}`,
          createdAt: adminSdk.firestore.FieldValue.serverTimestamp(),
        })
      }

      // Delete the campaign
      transaction.delete(campaignRef)

      console.log('[delete-task][advertiser] completed', { taskId, refunded: unusedBudget })
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
