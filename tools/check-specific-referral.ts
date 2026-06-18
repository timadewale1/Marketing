import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as path from 'path'

async function main() {
  // Initialize Firebase
  let serviceAccountKey
  try {
    const keyPath = path.join(__dirname, '../serviceAccountKey.json')
    serviceAccountKey = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
  } catch {
    const envKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    if (!envKey) {
      console.error('❌ No Firebase credentials found')
      process.exit(1)
    }
    serviceAccountKey = JSON.parse(envKey)
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountKey as admin.ServiceAccount),
  })

  const dbAdmin = admin.firestore()

  try {
    console.log('🔍 Searching for referral...\n')

    // Find referrer by email
    const referrerEmail = 'idowualalade49@gmail.com'
    const referredEmail = 'barnabasphilemon84@gmail.com'

    console.log(`📧 Referrer: ${referrerEmail}`)
    console.log(`📧 Referred: ${referredEmail}\n`)

    // Search earners collection for referrer
    const earnerReferrerSnap = await dbAdmin
      .collection('earners')
      .where('email', '==', referrerEmail)
      .get()

    // Search advertisers collection for referrer
    const advertiserReferrerSnap = await dbAdmin
      .collection('advertisers')
      .where('email', '==', referrerEmail)
      .get()

    let referrerId: string | null = null
    let referrerCollection: 'earners' | 'advertisers' | null = null

    if (earnerReferrerSnap.size > 0) {
      referrerId = earnerReferrerSnap.docs[0].id
      referrerCollection = 'earners'
      console.log(`✅ Found referrer in earners collection: ${referrerId}`)
    } else if (advertiserReferrerSnap.size > 0) {
      referrerId = advertiserReferrerSnap.docs[0].id
      referrerCollection = 'advertisers'
      console.log(`✅ Found referrer in advertisers collection: ${referrerId}`)
    } else {
      console.log(`❌ Referrer not found in earners or advertisers`)
      process.exit(1)
    }

    // Search for referred user
    const earnerReferredSnap = await dbAdmin
      .collection('earners')
      .where('email', '==', referredEmail)
      .get()

    const advertiserReferredSnap = await dbAdmin
      .collection('advertisers')
      .where('email', '==', referredEmail)
      .get()

    let referredId: string | null = null
    let referredUserCollection: 'earners' | 'advertisers' | null = null

    if (earnerReferredSnap.size > 0) {
      referredId = earnerReferredSnap.docs[0].id
      referredUserCollection = 'earners'
      const data = earnerReferredSnap.docs[0].data()
      console.log(`✅ Found referred user in earners collection: ${referredId}`)
      console.log(`   Activated: ${data.activated || false}`)
    } else if (advertiserReferredSnap.size > 0) {
      referredId = advertiserReferredSnap.docs[0].id
      referredUserCollection = 'advertisers'
      const data = advertiserReferredSnap.docs[0].data()
      console.log(`✅ Found referred user in advertisers collection: ${referredId}`)
      console.log(`   Activated: ${data.activated || false}`)
    } else {
      console.log(`❌ Referred user not found`)
      process.exit(1)
    }

    // Find referral record
    console.log(`\n🔎 Searching for referral record...\n`)

    const referralsSnap = await dbAdmin
      .collection('referrals')
      .where('referrerId', '==', referrerId)
      .where('referredId', '==', referredId)
      .get()

    if (referralsSnap.size === 0) {
      console.log(`❌ No referral record found between these users`)
      process.exit(1)
    }

    const referralDoc = referralsSnap.docs[0]
    const referralData = referralDoc.data()

    console.log(`✅ Found referral record: ${referralDoc.id}`)
    console.log(`   Status: ${referralData.status}`)
    console.log(`   Bonus Paid: ${referralData.bonusPaid}`)
    console.log(`   Bonus Amount: ₦${referralData.bonus?.toLocaleString() || 0}`)
    console.log(`   Created: ${referralData.createdAt?.toDate?.() || 'N/A'}`)

    if (referralData.bonusPaid === true) {
      console.log(`\n✅ Bonus has already been paid!`)
      process.exit(0)
    }

    if (referralData.bonus && referralData.bonus > 0) {
      console.log(`\n💰 Processing bonus payment...\n`)

      // Credit the bonus
      const txCollection = referrerCollection === 'advertisers' ? 'advertiserTransactions' : 'earnerTransactions'
      const txRef = dbAdmin.collection(txCollection).doc()
      const bonus = referralData.bonus

      await dbAdmin.runTransaction(async (transaction) => {
        // Create transaction record
        transaction.set(txRef, {
          userId: referrerId,
          type: 'referral_bonus',
          amount: bonus,
          status: 'completed',
          note: `Referral bonus for referring ${referredEmail}`,
          referralId: referralDoc.id,
          referredId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })

        // Credit referrer balance
        const referrerRef = dbAdmin.collection(referrerCollection!).doc(referrerId!)
        transaction.update(referrerRef, {
          balance: admin.firestore.FieldValue.increment(bonus),
        })

        // Mark referral completed
        const referralRef = dbAdmin.collection('referrals').doc(referralDoc.id)
        transaction.update(referralRef, {
          status: 'completed',
          bonusPaid: true,
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          paidAmount: bonus,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      })

      console.log(`✅ Bonus successfully credited!`)
      console.log(`   Amount: ₦${bonus.toLocaleString()}`)
      console.log(`   Credited to: ${referrerCollection} (${referrerId})`)
      console.log(`   Transaction ID: ${txRef.id}`)
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
