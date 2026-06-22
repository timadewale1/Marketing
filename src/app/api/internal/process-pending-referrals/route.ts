import { NextRequest, NextResponse } from 'next/server'
import { verifyInternalApiSecret } from '@/lib/internal-api-auth'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { proxyToBackendIfConfigured } from '@/lib/backend-route-proxy'
import { normalizeActivationReferralPendingAmount } from '@/lib/referral-rewards'

interface Referral {
  id?: string
  referrerId?: string
  referredId?: string
  amount?: number
  status?: string
  condition?: string
  bonusPaid?: boolean
}

interface User {
  activated?: boolean
}

export async function GET(req: NextRequest) {
  try {
    const proxied = await proxyToBackendIfConfigured('/api/internal/process-pending-referrals', req, { internalAuth: true })
    if (proxied) return proxied

    // Verify internal API secret
    const isValid = verifyInternalApiSecret(req)
    if (!isValid) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin || !admin) {
      return NextResponse.json(
        { success: false, message: 'Firebase not initialized' },
        { status: 500 }
      )
    }

    console.log('[process-pending-referrals] Starting pending referral processing...')

    // Pull pending referrals; filter bonusPaid in memory so legacy docs
    // with missing/dirty flags don't get stuck forever.
    const pendingReferralsSnap = await dbAdmin
      .collection('referrals')
      .where('status', '==', 'pending')
      .limit(300)
      .get()

    console.log(`[process-pending-referrals] Found ${pendingReferralsSnap.size} pending referrals to process`)

    let processed = 0
    let skipped = 0
    let failed = 0
    const results: Array<{
      referralId: string
      status: string
      referrerId?: string
      referredId?: string
      amount?: number
      reason?: string
    }> = []

    for (const referralDoc of pendingReferralsSnap.docs) {
      const referral = referralDoc.data() as Referral
      const { referrerId, referredId } = referral
      const condition = String(referral.condition || 'activation').toLowerCase()
      const amount = condition === 'activation'
        ? normalizeActivationReferralPendingAmount()
        : Number(referral.amount || 0)

      if ((referralDoc.data() as { bonusPaid?: boolean }).bonusPaid === true) {
        skipped++
        continue
      }

      if (!referrerId || !referredId || amount <= 0) {
        console.warn(`[process-pending-referrals] Skipping invalid referral ${referralDoc.id}`)
        results.push({
          referralId: referralDoc.id,
          status: 'skipped',
          reason: 'Invalid referral data',
        })
        skipped++
        continue
      }

      try {
        // Check if referred user is activated (check both earners and advertisers)
        const [referredEarnerSnap, referredAdvertiserSnap] = await Promise.all([
          dbAdmin.collection('earners').doc(referredId).get(),
          dbAdmin.collection('advertisers').doc(referredId).get(),
        ])

        const referredUser = (referredEarnerSnap.exists
          ? referredEarnerSnap.data()
          : referredAdvertiserSnap.data()) as User | undefined

        if (!referredUser?.activated) {
          console.log(
            `[process-pending-referrals] Referral ${referralDoc.id} - referred user not yet activated`
          )
          results.push({
            referralId: referralDoc.id,
            status: 'skipped',
            referredId,
            reason: 'Referred user not activated',
          })
          skipped++
          continue
        }

        // Find referrer (check both earners and advertisers)
        const [referrerEarnerSnap, referrerAdvertiserSnap] = await Promise.all([
          dbAdmin.collection('earners').doc(referrerId).get(),
          dbAdmin.collection('advertisers').doc(referrerId).get(),
        ])

        const referrerCollection = referrerAdvertiserSnap.exists
          ? 'advertisers'
          : referrerEarnerSnap.exists
            ? 'earners'
            : null

        if (!referrerCollection) {
          console.warn(
            `[process-pending-referrals] Referrer ${referrerId} not found for referral ${referralDoc.id}`
          )
          results.push({
            referralId: referralDoc.id,
            status: 'skipped',
            referrerId,
            reason: 'Referrer not found',
          })
          skipped++
          continue
        }

        // Process in transaction
        await dbAdmin.runTransaction(async (transaction) => {
          const referralRef = dbAdmin.collection('referrals').doc(referralDoc.id)
          const freshReferral = await transaction.get(referralRef)

          // Double-check still pending
          if (!freshReferral.exists || freshReferral.data()?.status !== 'pending') {
            console.log(
              `[process-pending-referrals] Referral ${referralDoc.id} already processed by another process`
            )
            return
          }

          const bonus = Number(freshReferral.data()?.amount || 0)
          if (bonus <= 0) return

          // Create transaction record
          const txCollection =
            referrerCollection === 'advertisers'
              ? 'advertiserTransactions'
              : 'earnerTransactions'
          const txRef = dbAdmin.collection(txCollection).doc()

          transaction.set(txRef, {
            userId: referrerId,
            type: 'referral_bonus',
            amount: bonus,
            status: 'completed',
            note: `Referral bonus for referring ${referredId}`,
            referralId: referralDoc.id,
            referredId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          })

          // Credit referrer balance
          const referrerRef = dbAdmin.collection(referrerCollection).doc(referrerId)
          transaction.update(referrerRef, {
            balance: admin.firestore.FieldValue.increment(bonus),
          })

          // Mark referral completed
          transaction.update(referralRef, {
            status: 'completed',
            bonusPaid: true,
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            paidAmount: bonus,
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            amount: bonus,
          })

          console.log(
            `[process-pending-referrals] Credited ${referrerCollection} ${referrerId} ₦${bonus.toLocaleString()} for referral ${referralDoc.id}`
          )
        })

        results.push({
          referralId: referralDoc.id,
          status: 'processed',
          referrerId,
          referredId,
          amount,
        })
        processed++
      } catch (err) {
        console.error(`[process-pending-referrals] Error processing referral ${referralDoc.id}:`, err)
        results.push({
          referralId: referralDoc.id,
          status: 'failed',
          reason: err instanceof Error ? err.message : 'Unknown error',
        })
        failed++
      }
    }

    const summary = {
      processed,
      skipped,
      failed,
      total: pendingReferralsSnap.size,
      results,
    }

    console.log('[process-pending-referrals] Summary:', summary)

    return NextResponse.json(
      {
        success: true,
        message: 'Pending referrals processed',
        ...summary,
      },
      { status: 200 }
    )
  } catch (err) {
    console.error('[process-pending-referrals] Error:', err)
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
