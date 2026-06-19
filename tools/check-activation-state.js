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

async function checkActivation() {
  console.log('\n🔍 CHECKING ACTIVATION: earner_6qd1tqSZerSxh7hcIWnG8jVkfuR2\n');

  try {
    const activationRef = await db
      .collection('activationAttempts')
      .where('userId', '==', 'earner_6qd1tqSZerSxh7hcIWnG8jVkfuR2')
      .get();

    if (activationRef.size === 0) {
      console.log('❌ No activation found for this user');
      process.exit(0);
    }

    // Get the most recent activation
    const activations = activationRef.docs.map(doc => ({
      ref: doc,
      data: doc.data(),
      createdAt: doc.data().createdAt.toDate()
    })).sort((a, b) => b.createdAt - a.createdAt);

    const activation = activations[0].ref;
    const data = activations[0].data;

    console.log('📋 ACTIVATION DETAILS:');
    console.log(`   ID: ${activation.id}`);
    console.log(`   User: ${data.userId}`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Reference: ${data.reference}`);
    console.log(`   Provider: ${data.provider}`);
    console.log(`   Amount: ₦${data.amount}`);
    console.log(`   Created: ${new Date(data.createdAt.toDate()).toLocaleString()}`);
    console.log(`   Updated: ${new Date(data.updatedAt.toDate()).toLocaleString()}`);
    console.log(`\n   Retry Count: ${data.retryCount}`);
    console.log(`   Escalate: ${data.escalate}`);
    console.log(`   Auto Checks Locked: ${data.autoChecksLocked}`);
    
    if (data.nextRecoveryCheckAt) {
      const nextCheck = new Date(data.nextRecoveryCheckAt.toDate());
      const now = new Date();
      const isOverdue = nextCheck < now;
      console.log(`   Next Recovery At: ${nextCheck.toLocaleString()} ${isOverdue ? '⚠️ (OVERDUE!)' : ''}`);
    }

    console.log(`   Verification State: ${data.verificationState || 'not set'}`);
    console.log(`   Last Verification: ${data.lastVerificationAt ? new Date(data.lastVerificationAt.toDate()).toLocaleString() : 'never'}`);
    
    console.log('\n📊 ANALYSIS:');
    
    if (data.status === 'pending') {
      console.log(`❌ Still PENDING - activation did not complete`);
      
      if (data.retryCount === 0) {
        console.log(`   retryCount is 0 → First check (should have deferred)`);
      } else if (data.retryCount > 0) {
        console.log(`   retryCount is ${data.retryCount} → Subsequent checks happened`);
      }

      if (data.verificationState === 'paid') {
        console.log(`   ✅ Verification State: PAID - but activation wasn't processed (BUG!)`);
      } else if (data.verificationState === 'unverified') {
        console.log(`   ❌ Verification State: UNVERIFIED - Monnify didn't confirm payment`);
      } else {
        console.log(`   ⚠️  Verification State: ${data.verificationState || 'none'}`);
      }

      if (data.nextRecoveryCheckAt) {
        const nextCheck = new Date(data.nextRecoveryCheckAt.toDate());
        const now = new Date();
        if (nextCheck > now) {
          console.log(`   ⏳ Waiting for next check at ${nextCheck.toLocaleString()}`);
        } else {
          console.log(`   ⚠️  Next check was scheduled for ${nextCheck.toLocaleString()} but hasn't run yet`);
        }
      }

      if (data.escalate) {
        console.log(`   ⚠️  ESCALATED - has passed retry limits`);
      }

    } else if (data.status === 'completed') {
      console.log(`✅ Activation COMPLETED`);
      console.log(`   Completed at: ${new Date(data.completedAt.toDate()).toLocaleString()}`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkActivation();
