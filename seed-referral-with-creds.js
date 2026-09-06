#!/usr/bin/env node

/**
 * Seed referral database for users - simple version using env credentials
 * Usage: node seed-referral-with-creds.js <referrer-email> <referred-email>
 */

const admin = require('firebase-admin');

const referrerEmail = process.argv[2];
const referredEmail = process.argv[3];

if (!referrerEmail || !referredEmail) {
  console.error('Usage: node seed-referral-with-creds.js <referrer-email> <referred-email>');
  process.exit(1);
}

// Initialize Firebase Admin (automatically uses GOOGLE_APPLICATION_CREDENTIALS)
try {
  admin.initializeApp();
} catch (err) {
  if (!err.message.includes('already initialized')) {
    console.error('Error initializing Firebase:', err.message);
    process.exit(1);
  }
}

const db = admin.firestore();
const REFERRAL_BONUS = 500;

async function seedReferral() {
  try {
    console.log(`\n📋 Seeding referral: ${referrerEmail} → ${referredEmail}\n`);

    // Find referrer
    console.log(`🔍 Looking up referrer: ${referrerEmail}`);
    let referrerId = null;
    let referrerCollection = null;

    const earnerQuery = await db.collection('earners').where('email', '==', referrerEmail).limit(1).get();
    if (!earnerQuery.empty) {
      referrerId = earnerQuery.docs[0].id;
      referrerCollection = 'earners';
      console.log(`✅ Found referrer as earner: ${referrerId}`);
    } else {
      const advertiserQuery = await db.collection('advertisers').where('email', '==', referrerEmail).limit(1).get();
      if (!advertiserQuery.empty) {
        referrerId = advertiserQuery.docs[0].id;
        referrerCollection = 'advertisers';
        console.log(`✅ Found referrer as advertiser: ${referrerId}`);
      }
    }

    if (!referrerId) {
      console.error(`❌ Referrer not found: ${referrerEmail}`);
      process.exit(1);
    }

    // Find referred
    console.log(`\n🔍 Looking up referred user: ${referredEmail}`);
    let referredId = null;
    let referredCollection = null;
    let referredUserType = null;

    const referredEarnerQuery = await db.collection('earners').where('email', '==', referredEmail).limit(1).get();
    if (!referredEarnerQuery.empty) {
      referredId = referredEarnerQuery.docs[0].id;
      referredCollection = 'earners';
      referredUserType = 'earner';
      console.log(`✅ Found referred as earner: ${referredId}`);
    } else {
      const referredAdvertiserQuery = await db.collection('advertisers').where('email', '==', referredEmail).limit(1).get();
      if (!referredAdvertiserQuery.empty) {
        referredId = referredAdvertiserQuery.docs[0].id;
        referredCollection = 'advertisers';
        referredUserType = 'advertiser';
        console.log(`✅ Found referred as advertiser: ${referredId}`);
      }
    }

    if (!referredId) {
      console.error(`❌ Referred user not found: ${referredEmail}`);
      process.exit(1);
    }

    // Create referral record using transaction for atomicity
    console.log(`\n💰 Creating referral record with ₦${REFERRAL_BONUS} bonus...`);
    const referralId = `${referrerId}-${referredId}`;

    await db.runTransaction(async (transaction) => {
      const referralRef = db.collection('referrals').doc(referralId);
      const referralSnap = await transaction.get(referralRef);

      if (referralSnap.exists) {
        throw new Error(`Referral already exists: ${referralId}`);
      }

      // Create referral record
      transaction.set(referralRef, {
        referrerId,
        referredId,
        userType: referredUserType,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'completed',
        bonusPaid: true,
        amount: REFERRAL_BONUS,
        condition: 'activation',
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        paidAmount: REFERRAL_BONUS,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Create transaction record for referrer
      const txCollection = referrerCollection === 'advertisers' ? 'advertiserTransactions' : 'earnerTransactions';
      const txRef = db.collection(txCollection).doc();
      transaction.set(txRef, {
        userId: referrerId,
        type: 'referral_bonus',
        amount: REFERRAL_BONUS,
        status: 'completed',
        note: `Referral bonus for referring ${referredEmail} (${referredId})`,
        referralId: referralId,
        referredId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update referrer's balance
      const referrerRef = db.collection(referrerCollection).doc(referrerId);
      transaction.update(referrerRef, {
        balance: admin.firestore.FieldValue.increment(REFERRAL_BONUS),
      });

      // Increment referral count
      transaction.update(referrerRef, {
        pointsReferralCount: admin.firestore.FieldValue.increment(1),
        pointsLastReferralAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    console.log(`\n✅ Referral seeded successfully!\n`);
    console.log(`📊 Summary:`);
    console.log(`  • Referrer: ${referrerEmail} (${referrerId})`);
    console.log(`  • Referred: ${referredEmail} (${referredId})`);
    console.log(`  • Bonus: ₦${REFERRAL_BONUS}`);
    console.log(`  • Referral ID: ${referralId}`);
    console.log(`  • Status: Completed & Paid\n`);

    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Error seeding referral:`, error.message);
    process.exit(1);
  }
}

seedReferral();
