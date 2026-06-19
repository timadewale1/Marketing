#!/usr/bin/env node
/**
 * Check Friday activations for missing Monnify references
 * Scans all activations completed from Friday onwards and identifies
 * which ones are missing Monnify payment references (TX_ prefix)
 */

async function initFirebaseAdmin() {
  try {
    console.log('Importing firebase-admin...')
    const adminModule = await import('firebase-admin')
    console.log('adminModule type:', typeof adminModule)
    console.log('adminModule.default:', typeof adminModule.default)
    
    const admin = adminModule && (adminModule.default || adminModule)
    console.log('admin type:', typeof admin)
    if (!admin) {
      console.error('admin is null/undefined after assignment')
      return { admin: null, dbAdmin: null }
    }
    
    const fs = await import('fs')
    const path = await import('path')

    const cwd = process.cwd()
    const envPath = path.join(cwd, '.env')
    
    if (!fs.existsSync(envPath)) {
      console.error('❌ .env file not found at', envPath)
      return { admin: null, dbAdmin: null }
    }

    const envContent = fs.readFileSync(envPath, 'utf8')
    const serviceAccountMatch = envContent.match(/FIREBASE_SERVICE_ACCOUNT_KEY=(.+?)(?=\n[A-Z_]|$)/s)
    
    if (!serviceAccountMatch) {
      console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY not found in .env')
      return { admin: null, dbAdmin: null }
    }

    const serviceAccountJson = serviceAccountMatch[1].trim()
    const serviceAccount = JSON.parse(serviceAccountJson)

    // Initialize Firebase Admin
    if (!admin.apps || admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      })
    }

    const dbAdmin = admin.firestore()
    return { admin, dbAdmin }
  } catch (error) {
    console.error('❌ Firebase initialization error:', error.message)
    return { admin: null, dbAdmin: null }
  }
}

async function main() {
  try {
    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      console.error('❌ Failed to initialize Firebase')
      process.exit(1)
    }

    const db = dbAdmin

    console.log('\n🔍 CHECKING FRIDAY ACTIVATIONS FOR MONNIFY REFERENCES\n')

    // Friday June 13, 2026 at 00:00 UTC
    const fridayStart = new Date('2026-06-13T00:00:00Z')
    console.log(`📅 Scanning from: ${fridayStart.toISOString()}\n`)

    // Query completed activations from Friday onwards
    console.log('📋 Querying completed activations...')
    const activationsSnap = await db
      .collection('activationAttempts')
      .where('status', '==', 'completed')
      .where('createdAt', '>=', fridayStart)
      .orderBy('createdAt', 'desc')
      .get()

    console.log(`✅ Found ${activationsSnap.size} completed activations\n`)

    // Analyze results
    const results = {
      total: 0,
      withMonnify: 0,
      withoutMonnify: 0,
      missing: [],
      samples: [],
    }

    for (const doc of activationsSnap.docs) {
      const data = doc.data()
      results.total++

      const { userId, role, email, name, reference, references, createdAt } = data

      // Collect all references
      const allRefs = references || (reference ? [reference] : [])
      const monnifyRefs = allRefs.filter(r => r && String(r).startsWith('TX_'))

      if (monnifyRefs.length === 0) {
        results.withoutMonnify++
        if (results.missing.length < 25) {
          results.missing.push({
            userId,
            role,
            email,
            name,
            createdAt: createdAt?.toDate?.() || new Date(),
            allRefs: allRefs.join(', ') || 'NONE',
          })
        }
      } else {
        results.withMonnify++
        if (results.samples.length < 5) {
          results.samples.push({
            email,
            name,
            monnifyRefs: monnifyRefs.join(', '),
          })
        }
      }
    }

    // Print summary
    console.log('📊 SUMMARY:')
    console.log(`   Total completed: ${results.total}`)
    console.log(`   ✅ With Monnify ref (TX_): ${results.withMonnify}`)
    console.log(`   ❌ Without Monnify ref: ${results.withoutMonnify}`)

    const percentage = results.total > 0 
      ? ((results.withMonnify / results.total) * 100).toFixed(1) 
      : '0'
    console.log(`   Success rate: ${percentage}%\n`)

    // Show missing ones
    if (results.missing.length > 0) {
      console.log('❌ ACTIVATIONS WITHOUT MONNIFY REFERENCE:')
      results.missing.forEach((act, i) => {
        const createdStr = act.createdAt.toLocaleString('en-US', { 
          timeZone: 'UTC',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        })
        console.log(`\n  ${i + 1}. ${act.email} (${act.name})`)
        console.log(`     User: ${act.userId} | Role: ${act.role}`)
        console.log(`     Created: ${createdStr} UTC`)
        console.log(`     References: ${act.allRefs}`)
      })
      if (results.total - results.withMonnify > results.missing.length) {
        console.log(`\n  ... and ${results.total - results.withMonnify - results.missing.length} more without Monnify refs`)
      }
    }

    // Show samples of good ones
    if (results.samples.length > 0) {
      console.log('\n\n✅ SAMPLE ACTIVATIONS WITH MONNIFY REFS:')
      results.samples.forEach((act, i) => {
        console.log(`\n  ${i + 1}. ${act.email} (${act.name})`)
        console.log(`     Refs: ${act.monnifyRefs}`)
      })
    }

    console.log('\n✅ Analysis complete!\n')

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error)
    process.exit(1)
  }
}

main()
