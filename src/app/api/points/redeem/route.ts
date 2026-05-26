import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { getPointsUserCollection, getPointsEventId, redeemPointsInTransaction, POINTS_REDEEM_MINIMUM, pointsToNaira, type PointsRedeemTarget } from '@/lib/points'

function normalizeTarget(target: unknown): PointsRedeemTarget | null {
  const value = String(target || '').trim().toLowerCase()
  if (value === 'wallet' || value === 'withdraw' || value === 'bills' || value === 'tasks') return value
  return null
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const amount = Number(body?.amount || 0)
    const target = normalizeTarget(body?.target)
    const role = String(body?.role || '').trim().toLowerCase()
    const normalizedRole = role === 'advertiser' ? 'advertiser' : role === 'earner' ? 'earner' : null

    if (!target) {
      return NextResponse.json({ success: false, message: 'A valid redemption target is required' }, { status: 400 })
    }
    if (!normalizedRole) {
      return NextResponse.json({ success: false, message: 'Role is required' }, { status: 400 })
    }
    if (!amount || amount < POINTS_REDEEM_MINIMUM || amount % POINTS_REDEEM_MINIMUM !== 0) {
      return NextResponse.json(
        { success: false, message: `Redemption amount must be in multiples of ${POINTS_REDEEM_MINIMUM} points` },
        { status: 400 }
      )
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })
    }

    const decoded = await admin.auth().verifyIdToken(authHeader.slice(7))
    const userId = decoded.uid
    const userCollection = getPointsUserCollection(normalizedRole)
    const userRef = dbAdmin.collection(userCollection).doc(userId)
    const eventId = getPointsEventId('redeem', userCollection, userId, target, amount)

    const outcome = await dbAdmin.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef)
      if (!userSnap.exists) {
        throw new Error('User not found')
      }

      const activated = Boolean(userSnap.data()?.activated)
      if (userCollection === 'earners' && !activated && target !== 'wallet') {
        throw new Error('Please activate your account before redeeming points to bills, tasks, or withdrawals.')
      }

      const targetWalletPath = target === 'withdraw'
        ? userCollection === 'earners'
          ? '/earner/transactions'
          : '/advertiser/wallet'
        : target === 'bills'
          ? userCollection === 'earners'
            ? '/earner'
            : '/advertiser'
          : target === 'tasks'
            ? userCollection === 'advertisers'
              ? '/advertiser/create-campaign'
              : '/earner'
            : null

      const redeemResult = await redeemPointsInTransaction({
        adminDb: dbAdmin,
        admin,
        transaction,
        userCollection,
        userId,
        amount,
        eventId,
        target,
        note: `Redeemed points for ${target}`,
        extraLedgerData: {
          nextUrl: targetWalletPath,
        },
      })

      return {
        pointsBalanceAfter: Number(userSnap.data()?.pointsBalance || 0) - amount,
        walletBalanceAfter: redeemResult.balanceAfter,
        nextUrl: targetWalletPath,
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Points redeemed successfully',
      ...outcome,
      walletAmount: pointsToNaira(amount),
      minimumRedeemable: POINTS_REDEEM_MINIMUM,
    })
  } catch (error) {
    console.error('[points-redeem] error', error)
    const message = error instanceof Error ? error.message : 'Failed to redeem points'
    const status = message.toLowerCase().includes('activate') ? 403 : 400
    return NextResponse.json({ success: false, message }, { status })
  }
}
