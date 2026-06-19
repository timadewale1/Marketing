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

async function search() {
  console.log('\n🔍 SEARCHING FOR idowualalade49@gmail.com and barnabasphilemon84@gmail.com\n');

  try {
    // Search in earners
    console.log('Checking EARNERS collection...');
    const earnersSnap = await db.collection('earners').get();
    let found = 0;
    for (const doc of earnersSnap.docs) {
      const data = doc.data();
      if (data.email && (data.email.includes('idowu') || data.email.includes('barnabas'))) {
        console.log(`  ✅ Found: ${data.name} (${data.email})`);
        found++;
      }
    }
    if (found === 0) console.log('  No matches');

    // Search in advertisers
    console.log('\nChecking ADVERTISERS collection...');
    const advertisersSnap = await db.collection('advertisers').get();
    found = 0;
    for (const doc of advertisersSnap.docs) {
      const data = doc.data();
      if (data.email && (data.email.includes('idowu') || data.email.includes('barnabas'))) {
        console.log(`  ✅ Found: ${data.name} (${data.email})`);
        found++;
      }
    }
    if (found === 0) console.log('  No matches');

    // Check referrals for Philemon Barnabas
    console.log('\n\nSearching REFERRALS for "barnabasphilemon84"...');
    const referralsSnap = await db.collection('referrals').get();
    let referralCount = 0;
    for (const doc of referralsSnap.docs) {
      const data = doc.data();
      if (data.referredEmail && data.referredEmail.includes('barnabasphilemon84')) {
        console.log(`  ✅ Found referral:`);
        console.log(`     Referrer: ${data.referrerEmail} (${data.referrerName})`);
        console.log(`     Referee: ${data.referredEmail} (${data.referredName})`);
        console.log(`     Status: ${data.status}`);
        console.log(`     Bonus Paid: ${data.bonusPaid}`);
        console.log(`     Amount: ₦${data.amount || data.bonus || 1000}`);
        console.log(`     Referral ID: ${doc.id}`);
        referralCount++;
      }
    }
    if (referralCount === 0) {
      console.log('  ❌ No referrals found for barnabasphilemon84@gmail.com');
    }

    console.log('\n✅ Search complete!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

search();
