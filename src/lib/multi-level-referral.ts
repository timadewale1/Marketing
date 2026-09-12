// Multi-level referral bonus processing for Pamba Business Network
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore';
import type { FirebaseAdminCompat } from '@/lib/firebase-admin-compat';
import { REFERRAL_DISTRIBUTION } from '@/lib/activation-fees';

interface ReferralChain {
  level: number;
  userId: string;
  userName: string;
  collection: string;
  amount: number;
}

interface ReferralChainRecord {
  activatedUserId: string;
  activatedUserName: string;
  level: number;
  referrerId: string;
  referrerName: string;
  referrerEmail: string;
  amount: number;
  status: 'pending' | 'completed';
  creditsApplied: boolean;
  creditsAppliedAt?: unknown;
  createdAt: unknown;
  completedAt?: unknown;
}

/**
 * Get user name from either earner or advertiser collection
 */
async function getUserName(adminDb: AdminFirestore, userId: string, collection: string): Promise<string> {
  const userSnap = await adminDb.collection(collection).doc(userId).get();
  if (!userSnap.exists) return userId;
  
  const userData = userSnap.data();
  // Try different name fields based on user type
  return (
    userData?.fullName ||
    userData?.name ||
    userData?.businessName ||
    userData?.companyName ||
    userData?.email ||
    userId
  );
}

/**
 * Find referral chain up to 4 levels deep with user names
 */
export async function getReferralChain(
  adminDb: AdminFirestore,
  userId: string,
  maxLevels: number = 4
): Promise<ReferralChain[]> {
  const chain: ReferralChain[] = [];
  let currentUserId = userId;

  for (let level = 1; level <= maxLevels; level++) {
    // Find referral where referredId is currentUserId
    const referralsSnap = await adminDb
      .collection('referrals')
      .where('referredId', '==', currentUserId)
      .where('status', '==', 'completed')
      .limit(1)
      .get();

    if (referralsSnap.empty) {
      break; // No more referrers in chain
    }

    const referralDoc = referralsSnap.docs[0];
    const referral = referralDoc.data() as { referrerId?: string };
    const referrerId = referral.referrerId;

    if (!referrerId) {
      break;
    }

    // Determine the referrer's collection (earner or advertiser)
    const [earnerSnap, advertiserSnap] = await Promise.all([
      adminDb.collection('earners').doc(referrerId).get(),
      adminDb.collection('advertisers').doc(referrerId).get(),
    ]);

    const collection = advertiserSnap.exists ? 'advertisers' : earnerSnap.exists ? 'earners' : null;

    if (!collection) {
      break; // Referrer not found
    }

    // Get referrer's name
    const referrerName = await getUserName(adminDb, referrerId, collection);
    const amountForLevel = Object.values(REFERRAL_DISTRIBUTION)[level - 1];

    chain.push({
      level,
      userId: referrerId,
      userName: referrerName,
      collection,
      amount: amountForLevel,
    });

    currentUserId = referrerId;
  }

  return chain;
}

/**
 * Award multi-level referral bonuses for an activated user
 * This is called when a user completes activation payment
 */
export async function awardMultiLevelReferralBonuses(
  adminDb: AdminFirestore,
  admin: FirebaseAdminCompat,
  activatedUserId: string,
  activationFeeAmount: number = 4500
): Promise<{ awarded: number; failed: number; total: number }> {
  let awarded = 0;
  let failed = 0;
  let chain: ReferralChain[] = [];

  try {
    // Get activated user's name
    const [earnerSnap, advertiserSnap] = await Promise.all([
      adminDb.collection('earners').doc(activatedUserId).get(),
      adminDb.collection('advertisers').doc(activatedUserId).get(),
    ]);

    const activatedCollection = advertiserSnap.exists ? 'advertisers' : earnerSnap.exists ? 'earners' : null;
    if (!activatedCollection) {
      return { awarded: 0, failed: 0, total: 0 };
    }

    const activatedUserName = await getUserName(adminDb, activatedUserId, activatedCollection);
    chain = await getReferralChain(adminDb, activatedUserId, 4);

    for (let i = 0; i < chain.length; i++) {
      const referral = chain[i];
      
      // For each referrer in the chain, they see the name of the person they directly contributed to
      // Level 1 referrer sees: activated user's name
      // Level 2 referrer sees: Level 1 referrer's name
      // Level 3 referrer sees: Level 2 referrer's name
      // Level 4 referrer sees: Level 3 referrer's name
      const sourceUserName = i === 0 ? activatedUserName : chain[i - 1].userName;

      try {
        let wasAwarded = false
        await adminDb.runTransaction(async (transaction) => {
          const referrerRef = adminDb.collection(referral.collection).doc(referral.userId);
          const referrerSnap = await transaction.get(referrerRef);
          const chainRecordId = `multi-level-${activatedUserId}-level${referral.level}`;
          const chainRecordRef = adminDb.collection('referrals').doc(chainRecordId);
          const existingChainRecord = await transaction.get(chainRecordRef);

          if (!referrerSnap.exists) {
            return;
          }
          if (existingChainRecord.exists && existingChainRecord.data()?.creditsApplied === true) {
            return;
          }

          const bonus = referral.amount;
          const timestamp = admin.firestore.FieldValue.serverTimestamp();
          const txCollection = referral.collection === 'advertisers'
            ? 'advertiserTransactions'
            : 'earnerTransactions';

          const referrerData = referrerSnap.data();
          const referrerEmail = referrerData?.email;

          // Create transaction record with improved note
          transaction.set(adminDb.collection(txCollection).doc(), {
            userId: referral.userId,
            type: 'multi_level_referral_bonus',
            referralLevel: referral.level,
            amount: bonus,
            status: 'completed',
            note: `Level ${referral.level} referral bonus from ${sourceUserName}`,
            activatedUserId,
            activatedUserName,
            sourceUserName,
            createdAt: timestamp,
          });

          // Update referrer's balance
          transaction.update(referrerRef, {
            balance: admin.firestore.FieldValue.increment(bonus),
            updatedAt: timestamp,
          });

          // Save chain record in referrals collection for audit trail
          const chainRecord: ReferralChainRecord = {
            activatedUserId,
            activatedUserName,
            level: referral.level,
            referrerId: referral.userId,
            referrerName: referral.userName,
            referrerEmail: referrerEmail || '',
            amount: bonus,
            status: 'completed',
            creditsApplied: true,
            creditsAppliedAt: timestamp,
            createdAt: timestamp,
            completedAt: timestamp,
          };

          transaction.set(
            chainRecordRef,
            chainRecord,
            { merge: true }
          );
          wasAwarded = true;
        });

        if (wasAwarded) {
          awarded++;
        }
      } catch (error) {
        console.error(
          `[multi-level-referral] failed to award Level ${referral.level} bonus to ${referral.userId}:`,
          error
        );
        failed++;
      }
    }
  } catch (error) {
    console.error('[multi-level-referral] failed to get referral chain:', error);
  }

  return {
    awarded,
    failed,
    total: chain?.length || 0,
  };
}

/**
 * Get referral bonus information for a specific user
 */
export async function getUserReferralBonusInfo(
  adminDb: AdminFirestore,
  userId: string
) {
  const transactionsSnap = await adminDb
    .collectionGroup('Transactions')
    .where('userId', '==', userId)
    .where('type', 'in', ['referral_bonus', 'multi_level_referral_bonus'])
    .get();

  const bonuses = transactionsSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Array<{ id: string; amount?: number; referralLevel?: number }>;

  const total = bonuses.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const byLevel: Record<number, number> = {};

  bonuses.forEach(bonus => {
    if (bonus.referralLevel) {
      byLevel[bonus.referralLevel] = (byLevel[bonus.referralLevel] || 0) + (Number(bonus.amount) || 0);
    }
  });

  return {
    totalBonus: total,
    bonusCount: bonuses.length,
    byLevel,
    bonuses,
  };
}
