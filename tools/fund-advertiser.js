// Script to fund an advertiser account (for testing or manual top-ups)
// Usage: USER_IDS="uid1,uid2" AMOUNT=2000 node tools/fund-advertiser.js

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

async function fundAdvertiser(userId, amount, admin, dbAdmin) {
  try {
    const adminDb = dbAdmin

    console.log(`Funding advertiser ${userId} with ${amount}`)

    // Create a transaction record
    await adminDb.collection('advertiserTransactions').add({
      userId,
      type: 'wallet_funding',
      amount,
      provider: 'manual',
      reference: `manual-fund-${Date.now()}`,
      status: 'completed',
      note: `Wallet funded manually with ${amount}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    console.log(`Transaction record created`)

    // Increment advertiser balance
    try {
      const advRef = adminDb.collection('advertisers').doc(userId)
      await advRef.update({
        balance: admin.firestore.FieldValue.increment(Number(amount)),
      })
      console.log(`Advertiser ${userId} funded successfully with ${amount}`)
    } catch (updErr) {
      console.warn('Failed to update advertiser balance, trying earner:', updErr)
      try {
        const earnerRef = adminDb.collection('earners').doc(userId)
        await earnerRef.update({
          balance: admin.firestore.FieldValue.increment(Number(amount)),
        })
        console.log(`Earner ${userId} funded successfully with ${amount}`)
      } catch (e) {
        console.error('Failed to update earner balance:', e)
        throw e
      }
    }
  } catch (err) {
    console.error(`Error funding ${userId}:`, err)
    throw err
  }
}

async function main() {
  const userIdsEnv = process.env.USER_IDS || ''
  const amount = Number(process.env.AMOUNT || 2000)

  // Parse comma or space-separated list
  const userIds = userIdsEnv
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter((id) => id.trim().length > 0)

  if (userIds.length === 0) {
    console.error('Usage: USER_IDS="uid1,uid2" AMOUNT=2000 node tools/fund-advertiser.js')
    process.exit(1)
  }

  if (amount <= 0) {
    console.error('AMOUNT must be greater than 0')
    process.exit(1)
  }

  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin || !admin) {
    console.error('Failed to initialize Firebase admin')
    process.exit(1)
  }

  for (const userId of userIds) {
    console.log(`\nFunding user ${userId} with ${amount}`)
    try {
      await fundAdvertiser(userId, amount, admin, dbAdmin)
    } catch (err) {
      console.error(`Failed to fund ${userId}:`, err)
    }
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
