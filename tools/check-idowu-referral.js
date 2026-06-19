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

// Load service account key from environment
const serviceAccountKey = JSON.parse(serviceAccountKeyStr);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey),
  databaseURL: 'https://blessing-636ca.firebaseio.com'
});

const db = admin.firestore();

async function checkReferral() {
  console.log('\n🔍 CHECKING SPECIFIC REFERRAL\n');
  console.log('📧 Referrer: idowualalade49@gmail.com');
  console.log('📧 Referee: barnabasphilemon84@gmail.com\n');

  try {
    // Find all referrals by idowualalade49@gmail.com
    const referralsSnap = await db
      .collection('referrals')
      .where('referrerEmail', '==', 'idowualalade49@gmail.com')
      .get();

    console.log(`Found ${referralsSnap.size} referrals from idowualalade49@gmail.com\n`);

    let foundTargetReferral = false;

    // Look for the specific referral to Philemon Barnabas
    for (const doc of referralsSnap.docs) {
      const data = doc.data();
      
      if (data.referredEmail && data.referredEmail.toLowerCase().includes('barnabasphilemon84')) {
        foundTargetReferral = true;
        
        console.log('✅ FOUND TARGET REFERRAL:');
        console.log(`   Referral ID: ${doc.id}`);
        console.log(`   Referrer: ${data.referrerEmail} (${data.referrerName})`);
        console.log(`   Referee: ${data.referredEmail} (${data.referredName})`);
        console.log(`   Status: ${data.status}`);
        console.log(`   Bonus: ₦${data.amount || data.bonus || 1000}`);
        console.log(`   Bonus Paid: ${data.bonusPaid}`);
        console.log(`   Created: ${data.createdAt ? new Date(data.createdAt.toDate()).toLocaleString() : 'N/A'}`);
        console.log('');

        // Check if referee is activated
        const refereeEmail = data.referredEmail;
        const earnersSnap = await db.collection('earners').where('email', '==', refereeEmail).get();
        const advertisersSnap = await db.collection('advertisers').where('email', '==', refereeEmail).get();

        if (earnersSnap.size > 0) {
          const earnersData = earnersSnap.docs[0].data();
          console.log(`✅ Referee found in EARNERS collection`);
          console.log(`   Status: ${earnersData.status}`);
          console.log(`   Activated: ${earnersData.status === 'active' ? 'YES' : 'NO'}`);
          console.log(`   Balance: ₦${earnersData.balance || 0}`);
        } else if (advertisersSnap.size > 0) {
          const advertisersData = advertisersSnap.docs[0].data();
          console.log(`✅ Referee found in ADVERTISERS collection`);
          console.log(`   Status: ${advertisersData.status}`);
          console.log(`   Activated: ${advertisersData.status === 'active' ? 'YES' : 'NO'}`);
          console.log(`   Balance: ₦${advertisersData.balance || 0}`);
        } else {
          console.log(`❌ Referee NOT found in earners or advertisers`);
          process.exit(0);
        }

        // Check if bonus can be credited
        if (data.bonusPaid === true) {
          console.log(`\n❌ Bonus already paid`);
        } else if ((earnersSnap.size > 0 || advertisersSnap.size > 0) && data.bonusPaid === false) {
          console.log(`\n💰 BONUS CAN BE CREDITED - Processing now...\n`);

          const bonus = data.amount || data.bonus || 1000;
          const referralRef = db.collection('referrals').doc(doc.id);

          if (earnersSnap.size > 0) {
            const earnerRef = earnersSnap.docs[0].ref;
            const earnerData = earnersSnap.docs[0].data();

            await db.runTransaction(async (transaction) => {
              // Update referral
              transaction.update(referralRef, {
                status: 'completed',
                bonusPaid: true,
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
                paidAmount: bonus,
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              // Credit earner
              transaction.update(earnerRef, {
                balance: (earnerData.balance || 0) + bonus,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              // Create transaction record
              transaction.set(db.collection('earnerTransactions').doc(), {
                earnerEmail: earnerData.email,
                earnerName: earnerData.name,
                type: 'referral_bonus',
                amount: bonus,
                referralId: doc.id,
                description: `Referral bonus for ${data.referredName}`,
                status: 'completed',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            });

            console.log(`✅ SUCCESS!`);
            console.log(`   Credited: ${earnerData.name}`);
            console.log(`   Amount: ₦${bonus}`);
            console.log(`   New Balance: ₦${(earnerData.balance || 0) + bonus}`);
          } else if (advertisersSnap.size > 0) {
            const advertiserRef = advertisersSnap.docs[0].ref;
            const advertiserData = advertisersSnap.docs[0].data();

            await db.runTransaction(async (transaction) => {
              // Update referral
              transaction.update(referralRef, {
                status: 'completed',
                bonusPaid: true,
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
                paidAmount: bonus,
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              // Credit advertiser
              transaction.update(advertiserRef, {
                balance: (advertiserData.balance || 0) + bonus,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              // Create transaction record
              transaction.set(db.collection('advertiserTransactions').doc(), {
                advertiserEmail: advertiserData.email,
                advertiserName: advertiserData.name,
                type: 'referral_bonus',
                amount: bonus,
                referralId: doc.id,
                description: `Referral bonus for ${data.referredName}`,
                status: 'completed',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            });

            console.log(`✅ SUCCESS!`);
            console.log(`   Credited: ${advertiserData.name}`);
            console.log(`   Amount: ₦${bonus}`);
            console.log(`   New Balance: ₦${(advertiserData.balance || 0) + bonus}`);
          }
        }

        break;
      }
    }

    if (!foundTargetReferral) {
      console.log('❌ Referral from idowualalade49@gmail.com to barnabasphilemon84@gmail.com NOT FOUND\n');
      console.log('Showing all referrals from idowualalade49@gmail.com:\n');
      for (const doc of referralsSnap.docs) {
        const data = doc.data();
        console.log(`  📌 ${data.referredName} (${data.referredEmail})`);
        console.log(`     Status: ${data.status} | Bonus Paid: ${data.bonusPaid}`);
      }
    }

    // Now check for OTHER cases where bonuses aren't auto-crediting
    console.log('\n\n🔍 CHECKING FOR SIMILAR ISSUES (Activated users with unpaid bonuses)\n');

    const pendingReferrals = await db
      .collection('referrals')
      .where('bonusPaid', '==', false)
      .limit(200)
      .get();

    console.log(`Analyzing ${pendingReferrals.size} referrals with unpaid bonuses...\n`);

    let issuesFound = 0;
    const issuesList = [];

    for (const doc of pendingReferrals.docs) {
      const ref = doc.data();
      const refEmail = ref.referredEmail;

      // Check if this user is actually activated
      const earnerCheck = await db.collection('earners').where('email', '==', refEmail).limit(1).get();
      const advertiserCheck = await db.collection('advertisers').where('email', '==', refEmail).limit(1).get();

      if (earnerCheck.size > 0 || advertiserCheck.size > 0) {
        issuesFound++;
        const collection = earnerCheck.size > 0 ? 'earners' : 'advertisers';
        const amount = ref.amount || ref.bonus || 1000;
        
        issuesList.push({
          referralId: doc.id,
          referrer: ref.referrerName,
          referee: ref.referredName,
          refEmail,
          collection,
          amount,
          bonusAmount: ref.bonus || 1000
        });
      }
    }

    if (issuesFound > 0) {
      console.log(`⚠️  FOUND ${issuesFound} CASES WHERE BONUS ISN'T PAID BUT USER IS ACTIVATED:\n`);
      
      // Show first 10
      for (let i = 0; i < Math.min(10, issuesList.length); i++) {
        const issue = issuesList[i];
        console.log(`${i + 1}. ${issue.referrer} → ${issue.referee}`);
        console.log(`   Email: ${issue.refEmail}`);
        console.log(`   Bonus: ₦${issue.bonusAmount}`);
        console.log(`   Status: Activated in ${issue.collection}`);
        console.log('');
      }

      if (issuesList.length > 10) {
        console.log(`... and ${issuesList.length - 10} more similar cases\n`);
      }

      console.log(`\n📊 ROOT CAUSE ANALYSIS:`);
      console.log(`   - These bonuses weren't auto-credited because they might be edge cases`);
      console.log(`   - OR the auto-credit function had an issue at the time they activated`);
      console.log(`   - OR the referral record wasn't properly linked to the user`);
    } else {
      console.log('✅ NO ISSUES FOUND - All activated users have their bonuses credited!\n');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkReferral();
