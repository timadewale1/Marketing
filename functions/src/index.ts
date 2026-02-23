// functions/src/index.ts
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

// Guard feature detection: some firebase-functions versions/environments may not
// expose `functions.scheduler.onSchedule` (older/newer incompatibilities). If the
// function is not available, skip registering scheduled functions so the
// deployment static analysis doesn't crash.
const hasPubsubSchedule = Boolean((functions as any).scheduler && typeof (functions as any).scheduler.onSchedule === 'function');

// Export named functions so deploy-time analysis can find them deterministically.
let processDueActivations: any;
if (hasPubsubSchedule) {
	processDueActivations = (functions as any).scheduler
		.onSchedule('every 5 minutes', async (context: any) => {
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
	// Fallback HTTP function so the export exists during analysis (no-op)
	processDueActivations = functions.https.onRequest((req, res) => {
		res.status(200).send('processDueActivations: schedule unavailable');
	});
	console.warn('processDueActivations: schedule unavailable; exported fallback HTTP function');
}
exports.processDueActivations = processDueActivations;

// Scheduled function to auto-verify submissions older than 24 hours
if (hasPubsubSchedule) {
	(exports as any).autoVerifySubmissions = (functions as any).scheduler
		.onSchedule('every 24 hours', async () => {
		const db = admin.firestore();
		const now = Date.now();
		const twentyFourHours = 1000 * 60 * 60 * 24;
		const cutoff = admin.firestore.Timestamp.fromMillis(now - twentyFourHours);

		const q = db.collection('earnerSubmissions')
			.where('status', '==', 'Pending')
			.where('createdAt', '<=', cutoff)
			.limit(200);

		const snap = await q.get();
		if (snap.empty) return null;

		for (const sDoc of snap.docs) {
			try {
				await db.runTransaction(async (t) => {
					const subRef = sDoc.ref;
					const subSnap = await t.get(subRef);
					if (!subSnap.exists) return;
					const submission = subSnap.data() as any;
					if ((submission.status || '') !== 'Pending') return;

					// Determine earner amount
					let earnerAmount = Number(submission.earnerPrice || 0);
					const campaignId = submission.campaignId;
					let campaign: any = null;
					if ((!earnerAmount || earnerAmount === 0) && campaignId) {
						const cSnap = await t.get(db.collection('campaigns').doc(campaignId));
						if (cSnap.exists) {
							campaign = cSnap.data();
							const costPerLead = Number(campaign?.costPerLead || 0);
							earnerAmount = Math.round(costPerLead / 2) || 0;
						}
					} else if (campaignId) {
						const cSnap = await t.get(db.collection('campaigns').doc(campaignId));
						if (cSnap.exists) campaign = cSnap.data();
					}

					const fullAmount = earnerAmount * 2;
					// Prefer reservedAmount on the submission (reserved at creation time)
					const reservedOnSubmission = Number(submission.reservedAmount || 0);

					// If reservation exists, ensure campaign has sufficient reservedBudget
					if (campaign && reservedOnSubmission > 0) {
						const reservedBudget = Number(campaign.reservedBudget || 0);
						if (reservedBudget < reservedOnSubmission) {
							throw new Error('Insufficient reserved budget for auto-verify');
						}
					}

					const nowTimestamp = admin.firestore.FieldValue.serverTimestamp();

					// 1) Update submission
					t.update(subRef, {
						status: 'Verified',
						reviewedAt: nowTimestamp,
						autoVerified: true,
					});

					// 2) Update campaign (if present)
					if (campaignId && campaign) {
						const campaignRef = db.collection('campaigns').doc(campaignId);
						const estimated = Number(campaign.estimatedLeads || 0);
						const completedLeads = Number(campaign.generatedLeads || 0) + 1;
						const completionRate = estimated > 0 ? (completedLeads / estimated) * 100 : 0;

						// If reservation exists on the submission, consume reservedBudget; otherwise decrement budget directly
						const campaignUpdates: any = {
							generatedLeads: admin.firestore.FieldValue.increment(1),
							completedLeads: admin.firestore.FieldValue.increment(1),
							lastLeadAt: nowTimestamp,
							completionRate,
							dailySubmissionCount: admin.firestore.FieldValue.increment(1),
						};
						if (reservedOnSubmission > 0) {
							campaignUpdates.reservedBudget = admin.firestore.FieldValue.increment(-reservedOnSubmission);
						} else {
							campaignUpdates.budget = admin.firestore.FieldValue.increment(-fullAmount);
						}

						if (completionRate >= 100) campaignUpdates.status = 'Completed';
						t.update(campaignRef, campaignUpdates);
					}

					// 3) Earner transaction + balance
					if (earnerAmount > 0 && submission.userId) {
						const earnerTxRef = db.collection('earnerTransactions').doc();
						t.set(earnerTxRef, {
							userId: submission.userId,
							campaignId: campaignId || null,
							type: 'credit',
							amount: earnerAmount,
							status: 'completed',
							note: `Campaign submission verified ${sDoc.id}`,
							createdAt: nowTimestamp,
						});
						t.update(db.collection('earners').doc(submission.userId), {
							balance: admin.firestore.FieldValue.increment(earnerAmount),
							leadsPaidFor: admin.firestore.FieldValue.increment(1),
							totalEarned: admin.firestore.FieldValue.increment(earnerAmount),
							lastEarnedAt: nowTimestamp,
						});
					}

					// 4) Advertiser transaction + stats
					const advertiserId = submission.advertiserId || (campaign && campaign.ownerId);
					if (advertiserId) {
						const advTxRef = db.collection('advertiserTransactions').doc();
						t.set(advTxRef, {
							userId: advertiserId,
							campaignId: campaignId || null,
							type: 'debit',
							amount: fullAmount,
							status: 'completed',
							note: `Lead payment for ${submission.campaignTitle || ''}`,
							createdAt: nowTimestamp,
						});
						t.update(db.collection('advertisers').doc(advertiserId), {
							totalSpent: admin.firestore.FieldValue.increment(fullAmount),
							leadsGenerated: admin.firestore.FieldValue.increment(1),
							lastLeadAt: nowTimestamp,
						});
					}
				});
			} catch (err) {
				console.error('Auto-verify submission error for', sDoc.id, err);
			}
		}

				return null;
		});
} else {
	console.warn('Skipping autoVerifySubmissions: functions.pubsub.schedule is not available in this firebase-functions install. Consider upgrading firebase-functions.');
}

// Analyzer-friendly export guard: ensure a top-level named export exists
try {
	if (!(exports as any).autoVerifySubmissions) {
		(exports as any).autoVerifySubmissions = functions.https.onRequest((req, res) => {
			res.status(200).send('autoVerifySubmissions: schedule unavailable');
		});
		console.warn('autoVerifySubmissions: fallback HTTP export registered for static analysis');
	} else {
		exports.autoVerifySubmissions = (exports as any).autoVerifySubmissions;
	}
} catch (err) {
	console.warn('autoVerifySubmissions export guard failed', err);
}