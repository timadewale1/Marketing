import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";

admin.initializeApp();

const TWELVE_HOURS_MS = 1000 * 60 * 60 * 12;

export const processDueActivations = onSchedule("every 24 hours", async () => {
  console.log("processDueActivations is intentionally inactive for now.");
});

export const autoVerifySubmissions = onSchedule("every 60 minutes", async () => {
  const db = admin.firestore();
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - TWELVE_HOURS_MS);

  const snap = await db
    .collection("earnerSubmissions")
    .where("status", "==", "Pending")
    .where("createdAt", "<=", cutoff)
    .limit(200)
    .get();

  if (snap.empty) return;

  for (const sDoc of snap.docs) {
    try {
      await db.runTransaction(async (t) => {
        const subRef = sDoc.ref;
        const subSnap = await t.get(subRef);
        if (!subSnap.exists) return;

        const submission = subSnap.data() as Record<string, unknown>;
        if (String(submission.status || "") !== "Pending") return;

        let earnerAmount = Number(submission.earnerPrice || 0);
        const campaignId = String(submission.campaignId || "");
        let campaign: Record<string, unknown> | null = null;

        if (campaignId) {
          const campaignRef = db.collection("campaigns").doc(campaignId);
          const campaignSnap = await t.get(campaignRef);
          if (campaignSnap.exists) {
            campaign = campaignSnap.data() as Record<string, unknown>;
            if (!earnerAmount) {
              const costPerLead = Number(campaign?.costPerLead || 0);
              earnerAmount = Math.round(costPerLead / 2) || 0;
            }
          }
        }

        const fullAmount = earnerAmount * 2;
        const reservedOnSubmission = Number(submission.reservedAmount || 0);

        if (campaign && reservedOnSubmission > 0) {
          const reservedBudget = Number(campaign.reservedBudget || 0);
          if (reservedBudget < reservedOnSubmission) {
            throw new Error("Insufficient reserved budget for auto-verify");
          }
        }

        const nowTimestamp = admin.firestore.FieldValue.serverTimestamp();

        t.update(subRef, {
          status: "Verified",
          reviewedAt: nowTimestamp,
          autoVerified: true,
          updatedAt: nowTimestamp,
        });

        if (campaignId && campaign) {
          const campaignRef = db.collection("campaigns").doc(campaignId);
          const completedLeads = Number(campaign.generatedLeads || 0) + 1;
          const estimated = Number(campaign.estimatedLeads || 0);
          const completionRate = estimated > 0 ? (completedLeads / estimated) * 100 : 0;

          const campaignUpdates: Record<string, unknown> = {
            generatedLeads: admin.firestore.FieldValue.increment(1),
            completedLeads: admin.firestore.FieldValue.increment(1),
            lastLeadAt: nowTimestamp,
            completionRate,
            dailySubmissionCount: admin.firestore.FieldValue.increment(1),
            lastUpdated: nowTimestamp,
          };

          if (reservedOnSubmission > 0) {
            campaignUpdates.reservedBudget = admin.firestore.FieldValue.increment(-reservedOnSubmission);
          } else {
            campaignUpdates.budget = admin.firestore.FieldValue.increment(-fullAmount);
          }

          if (completionRate >= 100) {
            campaignUpdates.status = "Completed";
          }

          t.update(campaignRef, campaignUpdates);
        }

        const userId = String(submission.userId || "");
        if (earnerAmount > 0 && userId) {
          const earnerTxRef = db.collection("earnerTransactions").doc();
          t.set(earnerTxRef, {
            userId,
            campaignId: campaignId || null,
            type: "credit",
            amount: earnerAmount,
            status: "completed",
            note: `Task approved after review ${sDoc.id}`,
            createdAt: nowTimestamp,
          });
          t.update(db.collection("earners").doc(userId), {
            balance: admin.firestore.FieldValue.increment(earnerAmount),
            leadsPaidFor: admin.firestore.FieldValue.increment(1),
            totalEarned: admin.firestore.FieldValue.increment(earnerAmount),
            lastEarnedAt: nowTimestamp,
          });
        }

        const advertiserId = String(submission.advertiserId || campaign?.ownerId || "");
        if (advertiserId) {
          const advertiserTxRef = db.collection("advertiserTransactions").doc();
          t.set(advertiserTxRef, {
            userId: advertiserId,
            campaignId: campaignId || null,
            type: "debit",
            amount: fullAmount,
            status: "completed",
            note: `Lead payment for ${String(submission.campaignTitle || "")}`,
            createdAt: nowTimestamp,
          });
          t.update(db.collection("advertisers").doc(advertiserId), {
            totalSpent: admin.firestore.FieldValue.increment(fullAmount),
            leadsGenerated: admin.firestore.FieldValue.increment(1),
            lastLeadAt: nowTimestamp,
          });
        }
      });
    } catch (error) {
      console.error("Auto-verify submission error for", sDoc.id, error);
    }
  }
});
