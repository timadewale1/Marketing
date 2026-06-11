import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as path from 'path'

// Referral bonus constants
const REFERRAL_PROMO_START_AT = new Date("2026-06-08T00:00:00+01:00")
const PROMO_ACTIVATION_REFERRAL_AMOUNT = 1000

function isPromoActive(now: Date = new Date()) {
  return now.getTime() >= REFERRAL_PROMO_START_AT.getTime()
}

function getReferralActivationBonusAmount(now: Date = new Date()) {
  return isPromoActive(now) ? PROMO_ACTIVATION_REFERRAL_AMOUNT : 500
}

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
    console.log('🔍 Fixing referral bonus...\n')

    const referrerEmail = 'idowualalade49@gmail.com'
    const referredEmail = 'angeloreoluwa999@gmail.com'
    const referralId = 'ehfyYJTck6OuLVomFPOWvv34ui33-4GkA3BaPjuf5EJENK4QQUOfMvTz1'
    const referrerId = 'ehfyYJTck6OuLVomFPOWvv34ui33'
    const referredId = '4GkA3BaPjuf5EJENK4QQUOfMvTz1'
    const correctBonus = getReferralActivationBonusAmount()

    console.log(`📧 Referrer: ${referrerEmail} (${referrerId})`)
    console.log(`📧 Referred: ${referredEmail} (${referredId})`)
    console.log(`💰 Correct Bonus: ₦${correctBonus.toLocaleString()}\n`)

    // Get referral record
    const referralRef = dbAdmin.collection('referrals').doc(referralId)
    const referralSnap = await referralRef.get()

    if (!referralSnap.exists) {
      console.log(`❌ Referral record not found`)
      process.exit(1)
    }

    const referralData = referralSnap.data()!
    console.log(`📋 Current Bonus: ₦${referralData.bonus?.toLocaleString() || 0}`)
    console.log(`📋 Current Status: ${referralData.status}`)
    console.log(`📋 Bonus Paid: ${referralData.bonusPaid}\n`)

    // Credit the bonus with corrected amount
    const txCollection = 'earnerTransactions'
    const txRef = dbAdmin.collection(txCollection).doc()

    console.log(`💸 Processing bonus payment...\n`)

    await dbAdmin.runTransaction(async (transaction) => {
      // Create transaction record
      transaction.set(txRef, {
        userId: referrerId,
        type: 'referral_bonus',
        amount: correctBonus,
        status: 'completed',
        note: `Referral bonus for referring ${referredEmail} (corrected)`,
        referralId: referralId,
        referredId: referredId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Credit referrer balance
      const referrerRef = dbAdmin.collection('earners').doc(referrerId)
      transaction.update(referrerRef, {
        balance: admin.firestore.FieldValue.increment(correctBonus),
      })

      // Update referral with correct bonus
      transaction.update(referralRef, {
        bonus: correctBonus,
        status: 'completed',
        bonusPaid: true,
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        paidAmount: correctBonus,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    })

    console.log(`✅ Bonus successfully credited!`)
    console.log(`   Amount: ₦${correctBonus.toLocaleString()}`)
    console.log(`   To: idowualalade49@gmail.com`)
    console.log(`   Transaction ID: ${txRef.id}`)
  } catch (err) {
    console.error('❌ Error:', err)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
