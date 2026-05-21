import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { DAILY_LOGIN_POINTS, getLagosDayKey, getPointsEventId, getPointsUserCollection, awardPointsInTransaction } from '@/lib/points'

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const role = String(body?.role || '').trim().toLowerCase()
    const normalizedRole = role === 'advertiser' ? 'advertiser' : role === 'earner' ? 'earner' : null
    if (!normalizedRole) {
      return NextResponse.json({ success: false, message: 'Role is required' }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })
    }

    const decoded = await admin.auth().verifyIdToken(authHeader.slice(7))
    const userId = decoded.uid
    const userCollection = getPointsUserCollection(normalizedRole)
    const userRef = dbAdmin.collection(userCollection).doc(userId)
    const dayKey = getLagosDayKey()
    const eventId = getPointsEventId('daily-login', userCollection, userId, dayKey)

    const result = await dbAdmin.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef)
      if (!userSnap.exists) {
        throw new Error('User not found')
      }

      const existingDay = String(userSnap.data()?.pointsLastLoginAwardDate || '').trim()
      if (existingDay === dayKey) {
        return { awarded: false, balance: Number(userSnap.data()?.pointsBalance || 0) }
      }

      const awarded = await awardPointsInTransaction({
        adminDb: dbAdmin,
        admin,
        transaction,
        userCollection,
        userId,
        amount: DAILY_LOGIN_POINTS,
        eventId,
        type: 'daily_login',
        note: 'Daily login bonus',
        referenceId: dayKey,
        extraUserUpdates: {
          pointsLoginCount: admin.firestore.FieldValue.increment(1),
          pointsLastLoginAwardDate: dayKey,
        },
        extraLedgerData: {
          dayKey,
        },
      })

      return {
        awarded,
        balance: Number(userSnap.data()?.pointsBalance || 0) + (awarded ? DAILY_LOGIN_POINTS : 0),
      }
    })

    return NextResponse.json({
      success: true,
      awarded: result.awarded,
      balance: result.balance,
      pointsAwarded: result.awarded ? DAILY_LOGIN_POINTS : 0,
    })
  } catch (error) {
    console.error('[points-login] error', error)
    const message = error instanceof Error ? error.message : 'Failed to award login points'
    return NextResponse.json({ success: false, message }, { status: 400 })
  }
}

