import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env');

// Load env file manually - handle JSON values
function loadEnv(filePath) {
  const envContent = fs.readFileSync(filePath, 'utf-8');
  const env = {};
  
  // Split by lines and group by key=value pairs
  const lines = envContent.split('\n');
  let currentKey = null;
  let currentValue = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if this line starts a new variable (matches KEY=...)
    const keyMatch = line.match(/^([A-Z_0-9]+)=/);
    
    if (keyMatch) {
      // Save previous key-value pair
      if (currentKey) {
        env[currentKey] = currentValue.trim();
      }
      
      // Start new key-value pair
      currentKey = keyMatch[1];
      currentValue = line.substring(currentKey.length + 1); // Get everything after KEY=
    } else if (currentKey) {
      // Continue appending to current value (for multiline values)
      currentValue += '\n' + line;
    }
  }
  
  // Save last key-value pair
  if (currentKey) {
    env[currentKey] = currentValue.trim();
  }
  
  return env;
}

const env = loadEnv(envPath);
const serviceAccountKeyStr = env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!serviceAccountKeyStr) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY not found in .env file');
  process.exit(1);
}

let serviceAccountKey;
try {
  serviceAccountKey = JSON.parse(serviceAccountKeyStr);
} catch (e) {
  console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY as JSON');
  console.error('Error:', e.message);
  console.error('Value length:', serviceAccountKeyStr.length);
  console.error('First 200 chars:', serviceAccountKeyStr.substring(0, 200));
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey),
  databaseURL: 'https://blessing-636ca.firebaseio.com'
});

const db = admin.firestore();

async function checkSpecificReferral() {
  console.log('\n🔍 Checking specific referral: idowualalade49@gmail.com → barnabasphilemon84@gmail.com\n');

  try {
    // Step 1: Find the referral record
    console.log('📋 Step 1: Finding referral record...');
    const referralsSnap = await db
      .collection('referrals')
      .where('referrerEmail', '==', 'idowualalade49@gmail.com')
      .get();

    console.log(`Found ${referralsSnap.docs.length} referrals for idowualalade49@gmail.com`);

    let targetReferral = null;
    let targetReferralId = null;

    for (const doc of referralsSnap.docs) {
      const data = doc.data();
      console.log(`\n  Referral ID: ${doc.id}`);
      console.log(`  Referrer: ${data.referrerEmail || data.referrerName || 'N/A'}`);
      console.log(`  Referee: ${data.referredEmail || data.referredName || 'N/A'}`);
      console.log(`  Status: ${data.status}`);
      console.log(`  Bonus Paid: ${data.bonusPaid}`);
      console.log(`  Created: ${data.createdAt ? new Date(data.createdAt.toDate()).toLocaleString() : 'N/A'}`);

      // Check if this is the referral to Philemon Barnabas
      if (
        (data.referredEmail?.toLowerCase().includes('barnabasphilemon84@gmail.com') ||
         data.referredName?.toLowerCase().includes('philemon') ||
         data.referredEmail?.toLowerCase().includes('barnabas'))
      ) {
        targetReferral = data;
        targetReferralId = doc.id;
        console.log('\n  ✅ THIS IS THE TARGET REFERRAL');
      }
    }

    if (!targetReferral) {
      console.log('\n❌ Target referral not found. Let me search all referrals for "barnabasphilemon84"...');
      const allReferralsSnap = await db
        .collection('referrals')
        .where('referredEmail', '==', 'barnabasphilemon84@gmail.com')
        .get();

      if (allReferralsSnap.size > 0) {
        targetReferral = allReferralsSnap.docs[0].data();
        targetReferralId = allReferralsSnap.docs[0].id;
        console.log(`Found referral for barnabasphilemon84@gmail.com: ${targetReferralId}`);
      } else {
        console.log('❌ Could not find any referral for barnabasphilemon84@gmail.com');
        return;
      }
    }

    console.log('\n---\n');
    console.log('📋 Step 2: Checking if referee (Philemon Barnabas) is activated...\n');

    const refereeEmail = targetReferral.referredEmail || 'barnabasphilemon84@gmail.com';
    const refereeName = targetReferral.referredName || 'Philemon Barnabas';

    // Check in earners collection
    const earnersSnap = await db
      .collection('earners')
      .where('email', '==', refereeEmail)
      .get();

    let isActivatedInEarners = false;
    let earnerData = null;

    if (earnersSnap.size > 0) {
      earnerData = earnersSnap.docs[0].data();
      isActivatedInEarners = earnerData.status === 'active' || earnerData.isActivated === true;
      console.log(`✅ Found in earners collection`);
      console.log(`  Name: ${earnerData.name}`);
      console.log(`  Status: ${earnerData.status}`);
      console.log(`  Is Activated: ${isActivatedInEarners}`);
      console.log(`  Activation Date: ${earnerData.activationDate ? new Date(earnerData.activationDate.toDate()).toLocaleString() : 'N/A'}`);
      console.log(`  Current Balance: ₦${earnerData.balance || 0}`);
    } else {
      console.log(`❌ Not found in earners collection`);
    }

    // Check in advertisers collection
    const advertisersSnap = await db
      .collection('advertisers')
      .where('email', '==', refereeEmail)
      .get();

    let isActivatedInAdvertisers = false;
    let advertiserData = null;

    if (advertisersSnap.size > 0) {
      advertiserData = advertisersSnap.docs[0].data();
      isActivatedInAdvertisers = advertiserData.status === 'active' || advertiserData.isActivated === true;
      console.log(`✅ Found in advertisers collection`);
      console.log(`  Name: ${advertiserData.name}`);
      console.log(`  Status: ${advertiserData.status}`);
      console.log(`  Is Activated: ${isActivatedInAdvertisers}`);
      console.log(`  Current Balance: ₦${advertiserData.balance || 0}`);
    } else {
      console.log(`❌ Not found in advertisers collection`);
    }

    const isActivated = isActivatedInEarners || isActivatedInAdvertisers;
    const referralData = targetReferral;

    console.log('\n---\n');
    console.log('📊 Step 3: Analyzing why bonus wasn\'t auto-credited...\n');

    const issues = [];

    if (!isActivated) {
      issues.push('❌ Referee is NOT activated - bonus should NOT be credited yet');
    } else {
      console.log('✅ Referee IS activated - bonus SHOULD have been credited');
    }

    if (referralData.bonusPaid === true) {
      issues.push('❌ Bonus is already marked as paid');
    } else if (referralData.bonusPaid === false) {
      console.log('✅ Bonus is marked as unpaid - can be credited');
    }

    if (referralData.status !== 'completed') {
      issues.push(`❌ Referral status is "${referralData.status}" (not "completed")`);
    }

    if (issues.length > 0) {
      console.log('Issues found:');
      issues.forEach(issue => console.log(`  ${issue}`));
    }

    // Determine action
    console.log('\n---\n');
    console.log('🔧 Step 4: Taking corrective action...\n');

    if (isActivated && referralData.bonusPaid === false) {
      console.log(`✅ Referee is activated and bonus unpaid. Crediting bonus now...\n`);

      const bonus = referralData.amount || 1000;
      const referrerId = referralData.referrerId;
      const referrerName = referralData.referrerName || 'Unknown';
      const referrerRole = referralData.referrerRole || 'earner';

      if (earnerData) {
        // Credit to earner
        const earnerRef = earnersSnap.docs[0].ref;
        const referralRef = db.collection('referrals').doc(targetReferralId);

        await db.runTransaction(async (transaction) => {
          transaction.update(earnerRef, {
            balance: (earnerData.balance || 0) + bonus,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          transaction.update(referralRef, {
            status: 'completed',
            bonusPaid: true,
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            paidAmount: bonus,
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Create transaction record
          transaction.set(db.collection('earnerTransactions').doc(), {
            earnerEmail: earnerData.email,
            earnerName: earnerData.name,
            type: 'referral_bonus',
            amount: bonus,
            referralId: targetReferralId,
            referredUserEmail: refereeEmail,
            referredUserName: refereeName,
            description: `Referral bonus for ${refereeName}`,
            status: 'completed',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });

        console.log(`✅ SUCCESS: Credited ${referrerName} (earners) ₦${bonus} for referral of ${refereeName}`);
        console.log(`   Referral ID: ${targetReferralId}`);
        console.log(`   New balance: ₦${(earnerData.balance || 0) + bonus}`);
      } else if (advertiserData) {
        // Credit to advertiser
        const advertiserRef = advertisersSnap.docs[0].ref;
        const referralRef = db.collection('referrals').doc(targetReferralId);

        await db.runTransaction(async (transaction) => {
          transaction.update(advertiserRef, {
            balance: (advertiserData.balance || 0) + bonus,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          transaction.update(referralRef, {
            status: 'completed',
            bonusPaid: true,
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            paidAmount: bonus,
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Create transaction record
          transaction.set(db.collection('advertiserTransactions').doc(), {
            advertiserEmail: advertiserData.email,
            advertiserName: advertiserData.name,
            type: 'referral_bonus',
            amount: bonus,
            referralId: targetReferralId,
            referredUserEmail: refereeEmail,
            referredUserName: refereeName,
            description: `Referral bonus for ${refereeName}`,
            status: 'completed',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });

        console.log(`✅ SUCCESS: Credited ${referrerName} (advertisers) ₦${bonus} for referral of ${refereeName}`);
        console.log(`   Referral ID: ${targetReferralId}`);
        console.log(`   New balance: ₦${(advertiserData.balance || 0) + bonus}`);
      }
    } else {
      console.log('❌ Cannot credit bonus. Reasons:');
      if (!isActivated) console.log(`   - Referee not activated`);
      if (referralData.bonusPaid) console.log(`   - Bonus already paid`);
    }

    // Additional investigation
    console.log('\n---\n');
    console.log('🔍 Step 5: Checking for similar cases (referrals with activated users but unpaid bonuses)...\n');

    const pendingReferrals = await db
      .collection('referrals')
      .where('bonusPaid', '==', false)
      .limit(100)
      .get();

    console.log(`Found ${pendingReferrals.size} referrals with unpaid bonuses (showing first 100)\n`);

    let count = 0;
    for (const doc of pendingReferrals.docs) {
      const ref = doc.data();
      const refEmail = ref.referredEmail;

      // Quick check if referee is activated
      const earnerCheck = await db
        .collection('earners')
        .where('email', '==', refEmail)
        .get();

      const advertiserCheck = await db
        .collection('advertisers')
        .where('email', '==', refEmail)
        .get();

      if (earnerCheck.size > 0 || advertiserCheck.size > 0) {
        count++;
        const collection = earnerCheck.size > 0 ? 'earners' : 'advertisers';
        console.log(`⚠️  ISSUE FOUND: ${ref.referrerName} → ${ref.referredName}`);
        console.log(`    Referral ID: ${doc.id}`);
        console.log(`    Referee Email: ${refEmail}`);
        console.log(`    Referee activated in: ${collection}`);
        console.log(`    Bonus amount: ₦${ref.amount || 1000}`);
        console.log('');
      }
    }

    console.log(`\n📊 Summary: Found ${count} referrals where user is activated but bonus unpaid`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

checkSpecificReferral();
