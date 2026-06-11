// Script to check for pending referrals where the referred person has been activated,
// then credit the referral bonus.
//
// Usage:
//   node tools/process-pending-referrals.js
//
// This script:
//   1. Finds all pending referrals
//   2. Checks if the referred user is activated
//   3. Credits the referral bonus to the referrer
//   4. Marks the referral as completed

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

    console.error('No Firebase credentials found')
    return { admin: null, dbAdmin: null }
  } catch (err) {
    console.error('Failed to initialize Firebase:', err)
    return { admin: null, dbAdmin: null }
  }
}

async function main() {
  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!admin || !dbAdmin) {
    console.error('Failed to initialize Firebase admin')
    process.exit(1)
  }

  console.log('🔄 Starting pending referral processing...')

  try {
    // Get referrals where bonus has NOT been paid yet
    const pendingReferralsSnap = await dbAdmin
      .collection('referrals')
      .where('bonusPaid', '==', false)
      .get()

    console.log(`📋 Found ${pendingReferralsSnap.size} referrals with unpaid bonuses\n`)

    let processed = 0
    let skipped = 0
    let failed = 0
    const uncreditedReferrals = []

    for (const referralDoc of pendingReferralsSnap.docs) {
      const referral = referralDoc.data()
      const { referrerId, referredId, amount, userType } = referral

      if (!referrerId || !referredId || amount <= 0) {
        console.warn(`⚠️  Skipping invalid referral ${referralDoc.id}`)
        skipped++
        continue
      }

      try {
        // Check if referred user is activated
        const referredEarnerRef = dbAdmin.collection('earners').doc(referredId)
        const referredAdvertiserRef = dbAdmin.collection('advertisers').doc(referredId)
        const [referredEarnerSnap, referredAdvertiserSnap] = await Promise.all([
          referredEarnerRef.get(),
          referredAdvertiserRef.get(),
        ])

        const referredUser = referredEarnerSnap.exists ? referredEarnerSnap.data() : referredAdvertiserSnap.data()
        if (!referredUser?.activated) {
          console.log(`⏳ Referral ${referralDoc.id} - referred user not yet activated`)
          skipped++
          continue
        }

        // Find referrer (earner or advertiser)
        const referrerEarnerRef = dbAdmin.collection('earners').doc(referrerId)
        const referrerAdvertiserRef = dbAdmin.collection('advertisers').doc(referrerId)
        const [referrerEarnerSnap, referrerAdvertiserSnap] = await Promise.all([
          referrerEarnerRef.get(),
          referrerAdvertiserRef.get(),
        ])

        const referrerCollection = referrerAdvertiserSnap.exists ? 'advertisers' : referrerEarnerSnap.exists ? 'earners' : null
        if (!referrerCollection) {
          const referrerName = referrerAdvertiserSnap.exists ? referrerAdvertiserSnap.data()?.companyName : referrerEarnerSnap.data()?.fullName
          uncreditedReferrals.push({
            referralId: referralDoc.id,
            referrerId,
            referrerName: referrerName || 'Unknown',
            referredId,
            amount,
            reason: 'Referrer account not found',
          })
          console.warn(`⚠️  Referrer ${referrerId} not found for referral ${referralDoc.id} - bonus cannot be credited`)
          failed++
          continue
        }

        // Process in transaction
        await dbAdmin.runTransaction(async (transaction) => {
          const referralRef = dbAdmin.collection('referrals').doc(referralDoc.id)
          const freshReferral = await transaction.get(referralRef)

          // Double-check bonus not already paid
          if (!freshReferral.exists || freshReferral.data()?.bonusPaid === true) {
            console.log(`✓ Referral ${referralDoc.id} bonus already paid`)
            return
          }

          const bonus = Number(freshReferral.data()?.amount || 0)
          if (bonus <= 0) return

          // Create transaction record
          const txCollection = referrerCollection === 'advertisers' ? 'advertiserTransactions' : 'earnerTransactions'
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
          })

          const referrerData = referrerAdvertiserSnap.exists ? referrerAdvertiserSnap.data() : referrerEarnerSnap.data()
          const referrerName = referrerData?.companyName || referrerData?.fullName || referrerId
          console.log(`✅ Credited ${referrerCollection} ${referrerName} (${referrerId}) ₦${bonus.toLocaleString()} for referral ${referralDoc.id}`)
        })

        processed++
      } catch (err) {
        console.error(`❌ Failed processing referral ${referralDoc.id}:`, err)
        failed++
      }
    }

    console.log(`\n📊 Summary:`)
    console.log(`   ✅ Credited: ${processed}`)
    console.log(`   ⏳ Skipped (referred user not activated): ${skipped}`)
    console.log(`   ❌ Failed (referrer account not found): ${failed}`)
    console.log(`   📈 Total referrals with unpaid bonuses: ${pendingReferralsSnap.size}`)

    if (uncreditedReferrals.length > 0) {
      console.log(`\n⚠️  UNCREDITED REFERRALS (${uncreditedReferrals.length}):`)
      console.log(`──────────────────────────────────────────────────────`)
      for (const ref of uncreditedReferrals) {
        console.log(`\n📌 Referral ID: ${ref.referralId}`)
        console.log(`   Referrer: ${ref.referrerName} (${ref.referrerId})`)
        console.log(`   Referred: ${ref.referredId}`)
        console.log(`   Amount: ₦${ref.amount.toLocaleString()}`)
        console.log(`   Reason: ${ref.reason}`)
      }
      console.log(`\n`)
    }
  } catch (err) {
    console.error('❌ Error:', err)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
