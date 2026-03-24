// JavaScript version of advertiser activation. Run this with plain node (no ts-node needed).
//
// Usage examples:
//   USER_IDS="uid1,uid2" node tools/activate-advertiser.js
//   USER_IDS="uid1 uid2" node tools/activate-advertiser.js
//
// The script will activate each specified advertiser and process their pending
// referrals exactly the same way the API route does.

// Inline initFirebaseAdmin so this script can run with plain Node (no ts-node)
async function initFirebaseAdmin() {
  try {
    const adminModule = await import('firebase-admin')
    const admin = adminModule && (adminModule.default || adminModule)
    const fs = await import('fs')
    const path = await import('path')

    let dbAdmin = null

    const root = process.cwd()
    const candidates = ['serviceAccountKey.json', 'serviceAccountKey.json.json', 'serviceAccountKey.json.txt']
    const found = candidates.map((c) => path.join(root, c)).find((p) => fs.existsSync(p))

    if (found) {
      const raw = fs.readFileSync(found, 'utf8')
      const serviceAccount = JSON.parse(raw)
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        })
      }
      dbAdmin = admin.firestore()
      return { admin, dbAdmin }
    }

    const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT
    if (serviceAccountEnv) {
      try {
        const serviceAccount = JSON.parse(serviceAccountEnv)
        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          })
        }
        dbAdmin = admin.firestore()
        return { admin, dbAdmin }
      } catch (err) {
        console.error('Error parsing service account from environment:', err)
        return { admin: null, dbAdmin: null }
      }
    }

    console.error('No service account key found')
    return { admin: null, dbAdmin: null }
  } catch (err) {
    console.error('initFirebaseAdmin error:', err)
    process.exit(1)
  }
}

async function activateAdvertiser(userId, admin, dbAdmin) {
  try {
    const adminDb = dbAdmin

    // Mark advertiser activated
    await adminDb.collection('advertisers').doc(userId).update({
      activated: true,
      activatedAt: admin.firestore.FieldValue.serverTimestamp(),
      activationPaymentProvider: 'manual', // Track manual activation
    })

    console.log(`Advertiser ${userId} marked as activated`)

    // Finalize pending referrals for this user (transaction-safe per-referral)
    const refsSnap = await adminDb
      .collection('referrals')
      .where('referredId', '==', userId)
      .where('status', '==', 'pending')
      .get()

    console.log(`Found ${refsSnap.size} pending referrals for ${userId}`)

    for (const rDoc of refsSnap.docs) {
      const r = rDoc.data()
      const bonus = Number(r.amount || 0)
      const referrerId = r.referrerId

      console.log(`Processing referral: ${rDoc.id}, referrerId: ${referrerId}, bonus: ${bonus}`)

      try {
        const rRef = adminDb.collection('referrals').doc(rDoc.id)
        await adminDb.runTransaction(async (t) => {
          const snap = await t.get(rRef)
          if (!snap.exists) {
            console.warn(`Referral already deleted: ${rDoc.id}`)
            return
          }
          const status = snap.data()?.status
          if (status !== 'pending') {
            console.warn(`Referral already processed: ${rDoc.id}, status: ${status}`)
            return
          }
          // mark referral completed and paid
          t.update(rRef, {
            status: 'completed',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            bonusPaid: true,
          })
          if (referrerId && bonus > 0) {
            const earnerRef = adminDb.collection('earners').doc(referrerId)
            const advRef = adminDb.collection('advertisers').doc(referrerId)
            const earnerSnap = await t.get(earnerRef)
            const advSnap = await t.get(advRef)

            if (advSnap.exists) {
              const txRef = adminDb.collection('advertiserTransactions').doc()
              t.set(txRef, {
                userId: referrerId,
                type: 'referral_bonus',
                amount: bonus,
                status: 'completed',
                note: `Referral bonus for referring ${userId}`,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              })
              t.update(advRef, { balance: admin.firestore.FieldValue.increment(bonus) })
              console.log(`Credited advertiser referrer bonus: ${referrerId}, amount: ${bonus}`)
            } else if (earnerSnap.exists) {
              const txRef = adminDb.collection('earnerTransactions').doc()
              t.set(txRef, {
                userId: referrerId,
                type: 'referral_bonus',
                amount: bonus,
                status: 'completed',
                note: `Referral bonus for referring ${userId}`,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              })
              t.update(earnerRef, { balance: admin.firestore.FieldValue.increment(bonus) })
              console.log(`Credited earner referrer bonus: ${referrerId}, amount: ${bonus}`)
            } else {
              console.warn(`Referrer account missing: ${referrerId}`)
            }
          }
        })
      } catch (e) {
        console.error(`Failed finalizing referral ${rDoc.id}:`, e)
      }
    }

    console.log(`Done activating advertiser ${userId}`)
  } catch (err) {
    console.error(`Error activating advertiser ${userId}:`, err)
    throw err
  }
}

async function main() {
  const userIdsEnv = process.env.USER_IDS || ''

  // Parse comma or space-separated list
  const userIds = userIdsEnv
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter((id) => id.trim().length > 0)

  if (userIds.length === 0) {
    console.error('Usage: USER_IDS="uid1,uid2" node tools/activate-advertiser.js')
    process.exit(1)
  }

  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin || !admin) {
    console.error('Failed to initialize Firebase admin')
    process.exit(1)
  }

  for (const userId of userIds) {
    console.log(`\nActivating advertiser ${userId}`)
    try {
      await activateAdvertiser(userId, admin, dbAdmin)
    } catch (err) {
      console.error(`Failed to activate ${userId}:`, err)
    }
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
