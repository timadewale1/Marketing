#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import admin from 'firebase-admin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load .env file
function loadEnv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const env = {}
  const lines = content.split('\n')
  for (const line of lines) {
    if (!line.trim() || line.startsWith('#')) continue
    const [key, ...valueParts] = line.split('=')
    if (key && valueParts.length > 0) {
      env[key.trim()] = valueParts.join('=').trim()
    }
  }
  return env
}

async function main() {
  try {
    // Load environment variables
    const envPath = path.join(__dirname, '..', '.env')
    const env = loadEnv(envPath)
    
    const serviceAccountKeyStr = env.FIREBASE_SERVICE_ACCOUNT_KEY
    if (!serviceAccountKeyStr) {
      console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY not found in .env')
      process.exit(1)
    }

    // Parse Firebase service account
    let serviceAccount
    try {
      serviceAccount = JSON.parse(serviceAccountKeyStr)
    } catch (e) {
      console.error('❌ Failed to parse Firebase service account:', e.message)
      process.exit(1)
    }

    // Initialize Firebase
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      })
    }

    const dbAdmin = admin.firestore()

    console.log('🔄 Processing activated referrals with unpaid bonuses...\n')

    let processed = 0
    let skipped = 0
    let failed = 0
    const issues = []

    const processActivatedUsers = async (collectionName) => {
      const activatedSnap = await dbAdmin
        .collection(collectionName)
        .where('activated', '==', true)
        .limit(5000)
        .get()

      for (const userDoc of activatedSnap.docs) {
        const user = userDoc.data() || {}
        const referredId = userDoc.id
        const referrerId = String(user.referredBy || '').trim()
        if (!referrerId) continue

        const referralId = `${referrerId}-${referredId}`
        const referralRef = dbAdmin.collection('referrals').doc(referralId)
        const referralSnap = await referralRef.get()
        if (!referralSnap.exists) {
          skipped++
          continue
        }

        const referral = referralSnap.data() || {}
        const bonusPaid = referral.bonusPaid === true
        const condition = String(referral.condition || 'activation').toLowerCase()
        const amount = Number(referral.amount || 0)
        if (bonusPaid || condition !== 'activation' || amount <= 0) {
          skipped++
          continue
        }

        try {
          const [referrerEarner, referrerAdvertiser] = await Promise.all([
            dbAdmin.collection('earners').doc(referrerId).get(),
            dbAdmin.collection('advertisers').doc(referrerId).get(),
          ])

          const referrerCollection = referrerAdvertiser.exists ? 'advertisers' : referrerEarner.exists ? 'earners' : null
          if (!referrerCollection) {
            issues.push({ referralId, referrerId, referredId, amount, issue: 'Referrer not found' })
            failed++
            continue
          }

          await dbAdmin.runTransaction(async (transaction) => {
            const freshReferral = await transaction.get(referralRef)
            if (!freshReferral.exists || freshReferral.data()?.bonusPaid === true) return

            const bonus = Number(freshReferral.data()?.amount || 0)
            if (bonus <= 0) return

            const txCollection = referrerCollection === 'advertisers' ? 'advertiserTransactions' : 'earnerTransactions'
            const txRef = dbAdmin.collection(txCollection).doc()

            transaction.set(txRef, {
              userId: referrerId,
              type: 'referral_bonus',
              amount: bonus,
              status: 'completed',
              note: `Referral bonus for referring ${referredId}`,
              referralId,
              referredId,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            })

            transaction.update(dbAdmin.collection(referrerCollection).doc(referrerId), {
              balance: admin.firestore.FieldValue.increment(bonus),
            })

            transaction.update(referralRef, {
              status: 'completed',
              bonusPaid: true,
              paidAt: admin.firestore.FieldValue.serverTimestamp(),
              paidAmount: bonus,
              completedAt: admin.firestore.FieldValue.serverTimestamp(),
            })
          })

          processed++
        } catch (err) {
          console.error(`❌ Failed to process referral ${referralId}:`, err.message)
          failed++
        }
      }
    }

    await processActivatedUsers('earners')
    await processActivatedUsers('advertisers')

    console.log(`\n📊 Summary:`)
    console.log(`   ✅ Processed: ${processed}`)
    console.log(`   ⏳ Skipped: ${skipped}`)
    console.log(`   ❌ Failed: ${failed}`)
    console.log(`   📈 Total processed paths: activated earners + activated advertisers`)

    if (issues.length > 0) {
      console.log(`\n⚠️  Issues found:`)
      for (const issue of issues) {
        console.log(`   - Referral ${issue.referralId}: ${issue.issue}`)
      }
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
