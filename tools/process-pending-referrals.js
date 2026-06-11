"use strict";
/*
  Script to check for pending referrals where the referred person has been activated,
  then credit the referral bonus.

  Usage:
    # Process all pending referrals where referred user is activated
    npx ts-node tools/process-pending-referrals.ts

    # or with node (compiled JS)
    node tools/process-pending-referrals.js

  This script:
    1. Finds all pending referrals
    2. Checks if the referred user is activated
    3. Credits the referral bonus to the referrer
    4. Marks the referral as completed
*/
Object.defineProperty(exports, "__esModule", { value: true });
const firebaseAdmin_1 = require("@/lib/firebaseAdmin");
async function main() {
    const { admin, dbAdmin } = await (0, firebaseAdmin_1.initFirebaseAdmin)();
    if (!admin || !dbAdmin) {
        console.error('Failed to initialize Firebase admin');
        process.exit(1);
    }
    const adminDb = dbAdmin;
    console.log('🔄 Starting pending referral processing...');
    try {
        // Get all pending referrals
        const pendingReferralsSnap = await adminDb
            .collection('referrals')
            .where('status', '==', 'pending')
            .get();
        console.log(`📋 Found ${pendingReferralsSnap.size} pending referrals`);
        let processed = 0;
        let skipped = 0;
        let failed = 0;
        for (const referralDoc of pendingReferralsSnap.docs) {
            const referral = referralDoc.data();
            const { referrerId, referredId, amount, userType } = referral;
            if (!referrerId || !referredId || amount <= 0) {
                console.warn(`⚠️  Skipping invalid referral ${referralDoc.id}`);
                skipped++;
                continue;
            }
            try {
                // Check if referred user is activated
                const referredEarnerRef = adminDb.collection('earners').doc(referredId);
                const referredAdvertiserRef = adminDb.collection('advertisers').doc(referredId);
                const [referredEarnerSnap, referredAdvertiserSnap] = await Promise.all([
                    referredEarnerRef.get(),
                    referredAdvertiserRef.get(),
                ]);
                const referredUser = (referredEarnerSnap.exists ? referredEarnerSnap.data() : referredAdvertiserSnap.data());
                if (!referredUser?.activated) {
                    console.log(`⏳ Referral ${referralDoc.id} - referred user not yet activated`);
                    skipped++;
                    continue;
                }
                // Find referrer (earner or advertiser)
                const referrerEarnerRef = adminDb.collection('earners').doc(referrerId);
                const referrerAdvertiserRef = adminDb.collection('advertisers').doc(referrerId);
                const [referrerEarnerSnap, referrerAdvertiserSnap] = await Promise.all([
                    referrerEarnerRef.get(),
                    referrerAdvertiserRef.get(),
                ]);
                const referrerCollection = referrerAdvertiserSnap.exists ? 'advertisers' : referrerEarnerSnap.exists ? 'earners' : null;
                if (!referrerCollection) {
                    console.warn(`⚠️  Referrer ${referrerId} not found for referral ${referralDoc.id}`);
                    skipped++;
                    continue;
                }
                // Process in transaction
                await adminDb.runTransaction(async (transaction) => {
                    const referralRef = adminDb.collection('referrals').doc(referralDoc.id);
                    const freshReferral = await transaction.get(referralRef);
                    // Double-check still pending
                    if (!freshReferral.exists || freshReferral.data()?.status !== 'pending') {
                        console.log(`✓ Referral ${referralDoc.id} already processed`);
                        return;
                    }
                    const bonus = Number(freshReferral.data()?.amount || 0);
                    if (bonus <= 0)
                        return;
                    // Create transaction record
                    const txCollection = referrerCollection === 'advertisers' ? 'advertiserTransactions' : 'earnerTransactions';
                    const txRef = adminDb.collection(txCollection).doc();
                    transaction.set(txRef, {
                        userId: referrerId,
                        type: 'referral_bonus',
                        amount: bonus,
                        status: 'completed',
                        note: `Referral bonus for referring ${referredId}`,
                        referralId: referralDoc.id,
                        referredId,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    // Credit referrer balance
                    const referrerRef = adminDb.collection(referrerCollection).doc(referrerId);
                    transaction.update(referrerRef, {
                        balance: admin.firestore.FieldValue.increment(bonus),
                    });
                    // Mark referral completed
                    transaction.update(referralRef, {
                        status: 'completed',
                        bonusPaid: true,
                        paidAt: admin.firestore.FieldValue.serverTimestamp(),
                        paidAmount: bonus,
                        completedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    console.log(`✅ Credited ${referrerCollection} ${referrerId} ₦${bonus.toLocaleString()} for referral ${referralDoc.id}`);
                });
                processed++;
            }
            catch (err) {
                console.error(`❌ Failed processing referral ${referralDoc.id}:`, err);
                failed++;
            }
        }
        console.log(`\n📊 Summary:`);
        console.log(`   ✅ Processed: ${processed}`);
        console.log(`   ⏳ Skipped: ${skipped}`);
        console.log(`   ❌ Failed: ${failed}`);
        console.log(`   📈 Total: ${pendingReferralsSnap.size}`);
    }
    catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
