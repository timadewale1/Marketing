import { NextRequest, NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

/**
 * GET /api/admin/referrals/debug?userId=xxx
 * Debug endpoint to check referral status for a user
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    const { admin: adminSdk } = await initFirebaseAdmin()
    if (!adminSdk) {
      return NextResponse.json({ error: 'Firebase not initialized' }, { status: 500 })
    }

    const db = adminSdk.firestore()

    // Find referrals for this user as referrer
    const asReferrer = await db.collection('referrals').where('referrerId', '==', userId).get()
    console.log(`[referral-debug] User ${userId} as referrer:`, asReferrer.size, 'referrals')

    // Find referrals for this user as referred
    const asReferred = await db.collection('referrals').where('referredId', '==', userId).get()
    console.log(`[referral-debug] User ${userId} as referred:`, asReferred.size, 'referrals')

    const referrerReferrals = asReferrer.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.(),
      completedAt: doc.data().completedAt?.toDate?.(),
    }))

    const referredReferrals = asReferred.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.(),
      completedAt: doc.data().completedAt?.toDate?.(),
    }))

    return NextResponse.json({
      userId,
      asReferrer: {
        count: referrerReferrals.length,
        referrals: referrerReferrals,
      },
      asReferred: {
        count: referredReferrals.length,
        referrals: referredReferrals,
      },
    })
  } catch (error) {
    console.error('[referral-debug] error:', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Debug failed' },
      { status: 500 }
    )
  }
}
