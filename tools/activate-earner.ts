/*
  Manual activation script for an earner user.
  - Marks the specified user as activated (sets activated, activatedAt, nextActivationDue)
  - Processes any pending referrals where the user was referred.

  Usage:
    # single ID (old style)
    $env:USER_ID="<earner uid>" npx ts-node tools/activate-earner.ts

    # multiple IDs (comma or space separated)
    $env:USER_IDS="uid1,uid2" npx ts-node tools/activate-earner.ts

    # or simply use the JS file with plain node (no ts-node required):
    $env:USER_IDS="uid1 uid2" node tools/activate-earner.js

  If you prefer, you can compile to JS or run with ts-node-dev. Ensure your
  Firebase admin credentials (serviceAccountKey.json etc) are available.
*/

import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

interface Referral {
  amount?: number | string
  referrerId?: string
  status: string
}

async function main() {
  // allow comma/space-separated list of IDs via USER_IDS or the old USER_ID
  const raw = process.env.USER_IDS || process.env.USER_ID
  if (!raw) {
    console.error('Please set USER_IDS (comma/space-separated) or USER_ID environment variable to the earner UID(s)')
    process.exit(1)
  }
  const userIds = raw.split(/[,\s]+/).filter(Boolean)
  if (userIds.length === 0) {
    console.error('No valid user IDs parsed from environment variable')
    process.exit(1)
  }

  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!admin || !dbAdmin) {
    console.error('Failed to initialize Firebase admin')
    process.exit(1)
  }

  const adminDb = dbAdmin as import('firebase-admin').firestore.Firestore

  // activation data
  const THREE_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 3
  const nextDue = admin.firestore.Timestamp.fromMillis(Date.now() + THREE_MONTHS_MS)

  for (const userId of userIds) {
    console.log('Activating earner', userId)
    await adminDb.collection('earners').doc(userId).update({
      activated: true,
      activatedAt: admin.firestore.FieldValue.serverTimestamp(),
      nextActivationDue: nextDue,
      activationPaymentProvider: 'manual-script',
    })

    // process referrals
    console.log('Looking up pending referrals for', userId)
    const refsSnap = await adminDb
      .collection('referrals')
      .where('referredId', '==', userId)
      .where('status', '==', 'pending')
      .get()

    console.log('Found', refsSnap.size, 'pending referrals')

    for (const rDoc of refsSnap.docs) {
      const r = rDoc.data() as Referral
      const bonus = Number(r.amount || 0)
      const referrerId = r.referrerId as string | undefined

      console.log('Processing referral', rDoc.id, 'bonus', bonus, 'referrer', referrerId)

      try {
        const rRef = adminDb.collection('referrals').doc(rDoc.id)
        await adminDb.runTransaction(async (t) => {
          const snap = await t.get(rRef)
          if (!snap.exists) {
            console.warn('Referral already deleted', rDoc.id)
            return
          }
          const status = snap.data()?.status
          if (status !== 'pending') {
            console.warn('Referral already processed', rDoc.id, 'status', status)
            return
          }

          t.update(rRef, { status: 'completed', completedAt: admin.firestore.FieldValue.serverTimestamp() })
          if (referrerId && bonus > 0) {
            const txRef = adminDb.collection('earnerTransactions').doc()
            t.set(txRef, {
              userId: referrerId,
              type: 'referral_bonus',
              amount: bonus,
              status: 'completed',
              note: `Referral bonus for referring ${userId}`,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            })
            const referrerRef = adminDb.collection('earners').doc(referrerId)
            t.update(referrerRef, { balance: admin.firestore.FieldValue.increment(bonus) })
            console.log('Credited referrer', referrerId, 'amount', bonus)
          }
        })
      } catch (e) {
        console.error('Failed finalizing referral', rDoc.id, e)
      }
    }
  }

  console.log('Done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
