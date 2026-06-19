const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load .env file manually
const envContent = fs.readFileSync(path.join(__dirname, '../.env'), 'utf-8');
let serviceAccountKeyStr = '';
let currentKey = null;
let currentValue = '';

const lines = envContent.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const keyMatch = line.match(/^([A-Z_0-9]+)=/);
  
  if (keyMatch) {
    if (currentKey === 'FIREBASE_SERVICE_ACCOUNT_KEY') {
      serviceAccountKeyStr = currentValue.trim();
    }
    currentKey = keyMatch[1];
    currentValue = line.substring(currentKey.length + 1);
  } else if (currentKey) {
    currentValue += '\n' + line;
  }
}

if (currentKey === 'FIREBASE_SERVICE_ACCOUNT_KEY') {
  serviceAccountKeyStr = currentValue.trim();
}

const serviceAccountKey = JSON.parse(serviceAccountKeyStr);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey),
  databaseURL: 'https://blessing-636ca.firebaseio.com'
});

const db = admin.firestore();

async function diagnose() {
  console.log('\n🔍 DIAGNOSING ACTIVATION ISSUE\n');

  try {
    // Check last few pending activations
    console.log('📋 Recent PENDING activations:');
    const pending = await db
      .collection('activationAttempts')
      .where('status', '==', 'pending')
      .limit(5)
      .get();

    console.log(`Found ${pending.size} pending activations\n`);

    for (const doc of pending.docs) {
      const data = doc.data();
      try {
        console.log(`  Activation ID: ${doc.id}`);
        console.log(`  User: ${data.userId}`);
        console.log(`  Status: ${data.status}`);
        console.log(`  Retry Count: ${data.retryCount || 'N/A'}`);
        console.log(`  Deferred: ${data.nextRecoveryCheckAt ? new Date(data.nextRecoveryCheckAt.toDate()).toLocaleString() : 'No'}`);
        console.log(`  Verification State: ${data.verificationState || 'N/A'}`);
        console.log(`  Created: ${data.createdAt ? new Date(data.createdAt.toDate()).toLocaleString() : 'N/A'}`);
        console.log('');
      } catch (e) {
        console.log(`  ERROR reading activation: ${e.message}`);
      }
    }

    // Check last few COMPLETED activations
    console.log('\n✅ Recent COMPLETED activations:');
    const completed = await db
      .collection('activationAttempts')
      .where('status', '==', 'completed')
      .limit(3)
      .get();

    console.log(`Found ${completed.size} completed activations\n`);

    for (const doc of completed.docs) {
      const data = doc.data();
      try {
        console.log(`  Activation ID: ${doc.id}`);
        console.log(`  User: ${data.userId}`);
        console.log(`  Completed: ${data.completedAt ? new Date(data.completedAt.toDate()).toLocaleString() : 'N/A'}`);
        console.log('');
      } catch (e) {
        console.log(`  ERROR reading activation: ${e.message}`);
      }
    }

    // Check for activations from today
    console.log('\n📅 ACTIVATIONS CREATED IN LAST HOUR:');
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const today = await db
      .collection('activationAttempts')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(oneHourAgo))
      .limit(20)
      .get();

    console.log(`Found ${today.size} activations created in last hour\n`);

    let deferredCount = 0;
    let completedCount = 0;
    let checkedCount = 0;

    for (const doc of today.docs) {
      const data = doc.data();
      try {
        console.log(`  ${data.userId}`);
        console.log(`    Status: ${data.status} | Retry: ${data.retryCount} | Verification: ${data.verificationState || 'N/A'}`);
        
        if (data.status === 'pending' && data.nextRecoveryCheckAt) {
          deferredCount++;
        } else if (data.status === 'completed') {
          completedCount++;
        } else if (data.status === 'pending' && data.retryCount > 0) {
          checkedCount++;
        }
      } catch (e) {
        console.log(`  ${data.userId} - ERROR reading dates`);
      }
    }

    console.log(`\n📊 SUMMARY:`);
    console.log(`   Deferred (waiting for next check): ${deferredCount}`);
    console.log(`   Completed: ${completedCount}`);
    console.log(`   Checked but failed: ${checkedCount}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

diagnose();
