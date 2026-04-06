const TARGET_REFERRER_ID = 'onkluWVRJ3WN0FP7wnJAudRmRTg1'

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
      const serviceAccount = JSON.parse(serviceAccountEnv)
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        })
      }
      dbAdmin = admin.firestore()
      return { admin, dbAdmin }
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      if (!admin.apps.length) admin.initializeApp()
      dbAdmin = admin.firestore()
      return { admin, dbAdmin }
    }

    return { admin: null, dbAdmin: null }
  } catch (error) {
    console.warn('[postbuild] firebase-admin initialization failed', error)
    return { admin: null, dbAdmin: null }
  }
}

async function isActivatedUser(dbAdmin, referredId) {
  const [earnerSnap, advertiserSnap] = await Promise.all([
    dbAdmin.collection('earners').doc(referredId).get(),
    dbAdmin.collection('advertisers').doc(referredId).get(),
  ])

  if (earnerSnap.exists) return Boolean(earnerSnap.data()?.activated)
  if (advertiserSnap.exists) return Boolean(advertiserSnap.data()?.activated)
  return false
}

async function backfillReferralBonuses() {
  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!admin || !dbAdmin) {
    console.log('[postbuild] skipping referral backfill because firebase admin is unavailable')
    return
  }

  const referralsSnap = await dbAdmin
    .collection('referrals')
    .where('referrerId', '==', TARGET_REFERRER_ID)
    .get()

  console.log(`[postbuild] found ${referralsSnap.size} referrals for ${TARGET_REFERRER_ID}`)

  for (const referralDoc of referralsSnap.docs) {
    const referral = referralDoc.data()
    const referredId = String(referral.referredId || '')
    const bonus = Number(referral.amount || 0)

    if (!referredId || bonus <= 0) continue

    const activated = await isActivatedUser(dbAdmin, referredId)
    if (!activated) {
      console.log(`[postbuild] skipping referral ${referralDoc.id}; referred user not activated`)
      continue
    }

    await dbAdmin.runTransaction(async (transaction) => {
      const referralRef = dbAdmin.collection('referrals').doc(referralDoc.id)
      const referralSnap = await transaction.get(referralRef)
      if (!referralSnap.exists) return

      const currentReferral = referralSnap.data() || {}
      if (currentReferral.bonusPaid === true) return

      const [earnerSnap, advertiserSnap] = await Promise.all([
        transaction.get(dbAdmin.collection('earners').doc(TARGET_REFERRER_ID)),
        transaction.get(dbAdmin.collection('advertisers').doc(TARGET_REFERRER_ID)),
      ])

      if (!earnerSnap.exists && !advertiserSnap.exists) {
        console.warn(`[postbuild] referrer account ${TARGET_REFERRER_ID} not found; leaving referral ${referralDoc.id} untouched`)
        return
      }

      transaction.update(referralRef, {
        status: 'completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        bonusPaid: true,
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        paidAmount: bonus,
      })

      if (earnerSnap.exists) {
        transaction.set(dbAdmin.collection('earnerTransactions').doc(), {
          userId: TARGET_REFERRER_ID,
          type: 'referral_bonus',
          amount: bonus,
          status: 'completed',
          note: `Referral bonus for referring ${referredId}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        transaction.update(dbAdmin.collection('earners').doc(TARGET_REFERRER_ID), {
          balance: admin.firestore.FieldValue.increment(bonus),
        })
        return
      }

      if (advertiserSnap.exists) {
        transaction.set(dbAdmin.collection('advertiserTransactions').doc(), {
          userId: TARGET_REFERRER_ID,
          type: 'referral_bonus',
          amount: bonus,
          status: 'completed',
          note: `Referral bonus for referring ${referredId}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        transaction.update(dbAdmin.collection('advertisers').doc(TARGET_REFERRER_ID), {
          balance: admin.firestore.FieldValue.increment(bonus),
        })
      }
    })

    console.log(`[postbuild] backfilled referral ${referralDoc.id} for referred user ${referredId}`)
  }
}

async function main() {
  if (!process.env.VERCEL && !process.env.VERCEL_ENV) {
    console.log('[postbuild] skipping vercel-only postbuild tasks outside Vercel')
    return
  }

  await backfillReferralBonuses()
}

main().catch((error) => {
  console.error('[postbuild] failed', error)
  process.exit(1)
})
