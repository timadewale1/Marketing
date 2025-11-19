// functions/src/index.ts
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

// Guard feature detection: some firebase-functions versions/environments may not
// expose `functions.pubsub.schedule` (older/newer incompatibilities). If the
// function is not available, skip registering scheduled functions so the
// deployment static analysis doesn't crash.
const hasPubsubSchedule = Boolean((functions as any).pubsub && typeof (functions as any).pubsub.schedule === 'function');

if (hasPubsubSchedule) {
	// Scheduled function to process due activation fees every 5 minutes
	(exports as any).processDueActivations = (functions.pubsub as any)
		.schedule('every 5 minutes')
		.onRun(async (context: any) => {
		const db = admin.firestore();
		const now = admin.firestore.Timestamp.now();
		const THREE_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 3; // approximate 3 months

		// Find earners that are activated and have nextActivationDue <= now OR activatedAt exists without nextActivationDue
		const earnersRef = db.collection('earners')
			.where('activated', '==', true);

		const snap = await earnersRef.get();
		const batch = db.batch();

		for (const docSnap of snap.docs) {
			const e = docSnap.data();
			const uid = docSnap.id;

			let nextDue: admin.firestore.Timestamp | null = null;
			if (e.nextActivationDue) {
				nextDue = e.nextActivationDue as admin.firestore.Timestamp;
			} else if (e.activatedAt) {
				nextDue = admin.firestore.Timestamp.fromMillis((e.activatedAt as admin.firestore.Timestamp).toMillis() + THREE_MONTHS_MS);
			}

			if (!nextDue) continue;

			if (nextDue.toMillis() <= now.toMillis()) {
				const balance = Number(e.balance || 0);
				const fee = 2000;
				if (balance >= fee) {
					// Deduct fee and set next due
					const newNext = admin.firestore.Timestamp.fromMillis(nextDue.toMillis() + THREE_MONTHS_MS);
					batch.update(docSnap.ref, {
						balance: admin.firestore.FieldValue.increment(-fee),
						nextActivationDue: newNext,
						lastActivationChargeAt: admin.firestore.FieldValue.serverTimestamp(),
					});

					// Record transaction
					const txRef = db.collection('earnerTransactions').doc();
					batch.set(txRef, {
						userId: uid,
						type: 'activation_fee',
						amount: fee,
						status: 'completed',
						note: 'Recurring activation fee',
						createdAt: admin.firestore.FieldValue.serverTimestamp(),
					});
				} else {
					// Not enough balance: deactivate and mark needs reactivation
					batch.update(docSnap.ref, {
						activated: false,
						needsReactivation: true,
						deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
					});
				}
			}
		}

					// Commit batch operations
					try {
						await batch.commit();
					} catch (err) {
						console.error('Error committing activation batch', err);
					}
				return null;
			});
		} else {
		  console.warn('Skipping processDueActivations: functions.pubsub.schedule is not available in this firebase-functions install. Consider upgrading firebase-functions.');
		}

// Scheduled function to auto-verify submissions older than 10 minutes
if (hasPubsubSchedule) {
	(exports as any).autoVerifySubmissions = (functions.pubsub as any)
		.schedule('every 2 minutes')
		.onRun(async () => {
		const db = admin.firestore();
		const now = Date.now();
		const tenMinutes = 1000 * 60 * 10;
		const cutoff = admin.firestore.Timestamp.fromMillis(now - tenMinutes);

		const q = db.collection('earnerSubmissions')
			.where('status', '==', 'Pending')
			.where('createdAt', '<=', cutoff)
			.limit(200);

		const snap = await q.get();
		if (snap.empty) return null;

		for (const sDoc of snap.docs) {
			const data = sDoc.data();
			try {
				// Compute earner amount - try to infer from earnerPrice or campaign
				let earnerAmount = Number(data.earnerPrice || 0);
				if (!earnerAmount && data.campaignId) {
					const c = await db.collection('campaigns').doc(data.campaignId).get();
								if (c.exists) {
									const cd = c.data();
						const costPerLead = Number(cd?.costPerLead || 0);
						earnerAmount = Math.round(costPerLead / 2) || 0;
					}
				}

				// Mark as verified and credit earner
				const updates: any = {
					status: 'Verified',
					reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
					autoVerified: true,
				};
				await sDoc.ref.update(updates);

				// Credit the earner wallet and create transaction
				if (earnerAmount > 0 && data.userId) {
					await db.collection('earnerTransactions').add({
						userId: data.userId,
						type: 'lead',
						amount: earnerAmount,
						status: 'completed',
						note: `Auto-verified campaign submission ${sDoc.id}`,
						createdAt: admin.firestore.FieldValue.serverTimestamp(),
					});
					await db.collection('earners').doc(data.userId).update({
						balance: admin.firestore.FieldValue.increment(earnerAmount),
					});
				}
			} catch (err) {
				console.error('Auto-verify submission error for', sDoc.id, err);
			}
		}

				return null;
		});
} else {
	console.warn('Skipping autoVerifySubmissions: functions.pubsub.schedule is not available in this firebase-functions install. Consider upgrading firebase-functions.');
}