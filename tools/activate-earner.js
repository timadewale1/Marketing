// JavaScript version of activate-earner.ts. Run this with plain node (no ts-node needed).
//
// Usage examples:
//   USER_IDS="uid1,uid2" node tools/activate-earner.js
//   USER_IDS="uid1 uid2" node tools/activate-earner.js
//
// The script will activate each specified earner and process their pending
// referrals exactly the same way the API route does.

// Inline initFirebaseAdmin so this script can run with plain Node (no ts-node)
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

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      if (!admin.apps.length) admin.initializeApp()
      dbAdmin = admin.firestore()
      return { admin, dbAdmin }
    }

    return { admin: null, dbAdmin: null }
  } catch (e) {
    console.error('firebase-admin initialization failed', e)
    return { admin: null, dbAdmin: null }
  }
}

async function main() {
  const userIdsRaw = process.env.USER_IDS || process.env.USER_ID;
  if (!userIdsRaw) {
    console.error('Please set USER_IDS (comma/space-separated) or USER_ID env variable');
    process.exit(1);
  }
  const userIds = userIdsRaw.split(/[,\s]+/).filter(Boolean);

  const { admin, dbAdmin } = await initFirebaseAdmin();
  if (!admin || !dbAdmin) {
    console.error('Failed to initialize Firebase admin');
    process.exit(1);
  }
  const adminDb = dbAdmin;

  const THREE_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 3;
  const nextDue = admin.firestore.Timestamp.fromMillis(Date.now() + THREE_MONTHS_MS);

  for (const userId of userIds) {
    console.log('Activating earner', userId);
    await adminDb.collection('earners').doc(userId).update({
      activated: true,
      activatedAt: admin.firestore.FieldValue.serverTimestamp(),
      nextActivationDue: nextDue,
      activationPaymentProvider: 'manual-script',
    });

    console.log('Looking up pending referrals for', userId);
    const refsSnap = await adminDb
      .collection('referrals')
      .where('referredId', '==', userId)
      .where('status', '==', 'pending')
      .get();

    console.log('Found', refsSnap.size, 'pending referrals');
    for (const rDoc of refsSnap.docs) {
      const r = rDoc.data();
      const bonus = Number(r.amount || 0);
      const referrerId = r.referrerId;

      console.log('Processing referral', rDoc.id, 'bonus', bonus, 'referrer', referrerId);
      try {
        const rRef = adminDb.collection('referrals').doc(rDoc.id);
        await adminDb.runTransaction(async (t) => {
          // Read referral and potential referrer docs first (Firestore requires reads before writes)
          const snap = await t.get(rRef);
          if (!snap.exists) {
            console.warn('Referral already deleted', rDoc.id);
            return;
          }
          const status = snap.data()?.status;
          if (status !== 'pending') {
            console.warn('Referral already processed', rDoc.id, 'status', status);
            return;
          }

          let earnerSnap = null
          let advSnap = null
          const earnerRef = referrerId ? adminDb.collection('earners').doc(referrerId) : null
          const advRef = referrerId ? adminDb.collection('advertisers').doc(referrerId) : null
          if (referrerId) {
            // perform reads first
            earnerSnap = await t.get(earnerRef)
            advSnap = await t.get(advRef)
          }

          // Now perform writes
          t.update(rRef, { status: 'completed', completedAt: admin.firestore.FieldValue.serverTimestamp(), bonusPaid: true });

          if (referrerId && bonus > 0) {
            if (earnerSnap && earnerSnap.exists) {
              const txRef = adminDb.collection('earnerTransactions').doc()
              t.set(txRef, {
                userId: referrerId,
                type: 'referral_bonus',
                amount: bonus,
                status: 'completed',
                note: `Referral bonus for referring ${userId}`,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              })
              t.update(earnerRef, { balance: admin.firestore.FieldValue.increment(bonus) })
              console.log('Credited earner referrer', referrerId, 'amount', bonus)
            } else if (advSnap && advSnap.exists) {
              const txRef2 = adminDb.collection('advertiserTransactions').doc()
              t.set(txRef2, {
                userId: referrerId,
                type: 'referral_bonus',
                amount: bonus,
                status: 'completed',
                note: `Referral bonus for referring ${userId}`,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              })
              t.update(advRef, { balance: admin.firestore.FieldValue.increment(bonus) })
              console.log('Credited advertiser referrer', referrerId, 'amount', bonus)
            } else {
              console.warn('Referrer not found in earners or advertisers:', referrerId)
            }
          }
        });
      } catch (e) {
        console.error('Failed finalizing referral', rDoc.id, e);
      }
    }
  }
  // After performing activations, also ensure any existing completed referrals
  // have bonusPaid set to true so they no longer show as pending in the UI.
  for (const userId of userIds) {
    const completedSnap = await adminDb
      .collection('referrals')
      .where('referredId', '==', userId)
      .where('status', '==', 'completed')
      .where('bonusPaid', '==', false)
      .get();
    for (const doc of completedSnap.docs) {
      console.log('Marking bonusPaid on referral', doc.id);
      await adminDb.collection('referrals').doc(doc.id).update({ bonusPaid: true });
    }
  }

  console.log('Done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
