import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/scheduler";
import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import nodemailer from "nodemailer";

admin.initializeApp();

let smtpTransporter: nodemailer.Transporter | null = null;

function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const smtpService = process.env.SMTP_SERVICE || "gmail";

  if (!smtpUser || !smtpPass) {
    throw new Error("SMTP_USER and SMTP_PASS are required");
  }

  smtpTransporter =
    smtpHost && smtpPort
      ? nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: smtpPass },
        })
      : nodemailer.createTransport({
          service: smtpService,
          auth: { user: smtpUser, pass: smtpPass },
        });

  return smtpTransporter;
}

const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://www.pambaadverts.com";

function getInternalApiBaseUrl() {
  const explicit = String(process.env.INTERNAL_API_BASE_URL || "").trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  // Do not auto-target Cloud Functions URL because gen2 HTTPS endpoints may be IAM-protected.
  // If needed, set INTERNAL_API_BASE_URL explicitly in functions env.
  return "";
}

function buildHeaders(routePath?: string) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-internal-source": "firebase-functions",
  };
  if (routePath) {
    headers["x-internal-route"] = routePath;
  }

  const internalSecret = String(process.env.API_INTERNAL_SECRET || process.env.CRON_SECRET || "").trim();
  if (internalSecret) {
    headers.Authorization = `Bearer ${internalSecret}`;
  }

  return headers;
}

async function callInternalRoute(path: string) {
  const headers = buildHeaders(path);
  const internalBase = getInternalApiBaseUrl();
  const appBase = APP_BASE_URL.replace(/\/$/, "");
  const targetCandidates = internalBase
    ? [`${appBase}${path}`, `${internalBase}${path}`]
    : [`${appBase}${path}`];

  let lastError: string | null = null;
  for (const targetUrl of targetCandidates) {
    try {
      const response = await fetch(targetUrl, {
        method: "GET",
        headers,
      });

      const payload = await response.json().catch(() => ({}));
      console.log(`[scheduler] ${path}`, {
        targetUrl,
        ok: response.ok,
        status: response.status,
        payload,
      });

      if (response.ok) {
        return payload;
      }

      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown error";
      console.warn(`[scheduler] ${path} call failed`, { targetUrl, error: lastError });
    }
  }

  throw new Error(`Scheduled call failed for ${path}${lastError ? `: ${lastError}` : ""}`);
}

async function callLegacyNextInternalRoute(path: string) {
  const targetUrl = `${APP_BASE_URL.replace(/\/$/, "")}${path}`;
  const headers = buildHeaders(path);
  headers["x-skip-backend-proxy"] = "1";

  const response = await fetch(targetUrl, {
    method: "GET",
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Legacy internal route failed for ${path} with status ${response.status}`);
  }
  return payload;
}

async function callLegacyNextInternalPostRoute(path: string, payload: Record<string, unknown>) {
  const targetUrl = `${APP_BASE_URL.replace(/\/$/, "")}${path}`;
  const headers = buildHeaders(path);
  headers["x-skip-backend-proxy"] = "1";
  headers["Content-Type"] = "application/json";

  const response = await fetch(targetUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Legacy POST route failed for ${path} with status ${response.status}`);
  }
  return body;
}

function isAuthorizedInternalRequest(authHeader: string | undefined) {
  const apiInternalSecret = String(process.env.API_INTERNAL_SECRET || "").trim();
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  const accepted = [apiInternalSecret, cronSecret].map((value) => value.trim()).filter(Boolean);
  if (!accepted.length) {
    console.warn("[internalApi] API_INTERNAL_SECRET/CRON_SECRET not configured; allowing internal request");
    return true;
  }
  return accepted.some((secret) => authHeader === `Bearer ${secret}`);
}

async function processPendingReferralsDirect() {
  const db = admin.firestore();
  const pendingReferralsSnap = await db
    .collection("referrals")
    .where("status", "==", "pending")
    .limit(300)
    .get();

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const referralDoc of pendingReferralsSnap.docs) {
    const referral = referralDoc.data() as {
      referrerId?: string;
      referredId?: string;
      amount?: number;
      bonusPaid?: boolean;
    };

    if (referral.bonusPaid === true) {
      skipped += 1;
      continue;
    }

    const referrerId = String(referral.referrerId || "");
    const referredId = String(referral.referredId || "");
    const amount = Number(referral.amount || 0);

    if (!referrerId || !referredId || amount <= 0) {
      skipped += 1;
      continue;
    }

    try {
      const [referredEarnerSnap, referredAdvertiserSnap] = await Promise.all([
        db.collection("earners").doc(referredId).get(),
        db.collection("advertisers").doc(referredId).get(),
      ]);

      const referredUser = referredEarnerSnap.exists
        ? referredEarnerSnap.data()
        : referredAdvertiserSnap.data();

      if (!referredUser?.activated) {
        skipped += 1;
        continue;
      }

      const [referrerEarnerSnap, referrerAdvertiserSnap] = await Promise.all([
        db.collection("earners").doc(referrerId).get(),
        db.collection("advertisers").doc(referrerId).get(),
      ]);

      const referrerCollection = referrerAdvertiserSnap.exists
        ? "advertisers"
        : referrerEarnerSnap.exists
          ? "earners"
          : null;

      if (!referrerCollection) {
        skipped += 1;
        continue;
      }

      await db.runTransaction(async (transaction) => {
        const referralRef = db.collection("referrals").doc(referralDoc.id);
        const freshReferral = await transaction.get(referralRef);
        if (!freshReferral.exists || String(freshReferral.data()?.status || "") !== "pending") {
          return;
        }

        const bonus = Number(freshReferral.data()?.amount || 0);
        if (bonus <= 0) return;

        const txCollection = referrerCollection === "advertisers"
          ? "advertiserTransactions"
          : "earnerTransactions";
        const txRef = db.collection(txCollection).doc();
        const referrerRef = db.collection(referrerCollection).doc(referrerId);

        transaction.set(txRef, {
          userId: referrerId,
          type: "referral_bonus",
          amount: bonus,
          status: "completed",
          note: `Referral bonus for referring ${referredId}`,
          referralId: referralDoc.id,
          referredId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        transaction.update(referrerRef, {
          balance: admin.firestore.FieldValue.increment(bonus),
        });

        transaction.update(referralRef, {
          status: "completed",
          bonusPaid: true,
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          paidAmount: bonus,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      processed += 1;
    } catch (error) {
      console.error("[functions][processPendingReferralsDirect] failed", referralDoc.id, error);
      failed += 1;
    }
  }

  return {
    success: true,
    processed,
    skipped,
    failed,
    total: pendingReferralsSnap.size,
  };
}

export const autoVerifySubmissions = onSchedule("every 60 minutes", async () => {
  try {
    await runDirectAutoVerifySubmissions();
  } catch (error) {
    console.error("[autoVerifySubmissions] direct run failed, falling back to internal route", error);
    await callInternalRoute("/api/internal/auto-verify-submissions");
  }
});

export const retryPendingMonnifyPayments = onSchedule("every 5 minutes", async () => {
  await callInternalRoute("/api/internal/recovery-sweep");
});

function normalizeReferences(values: unknown[]) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

let cachedMonnifyToken: { token: string; expiresAt: number } | null = null;

async function getMonnifyToken() {
  if (cachedMonnifyToken && cachedMonnifyToken.expiresAt > Date.now()) {
    return cachedMonnifyToken.token;
  }

  const base = String(process.env.MONNIFY_BASE_URL || "").trim();
  const apiKey = String(process.env.MONNIFY_API_KEY || "").trim();
  const secret = String(process.env.MONNIFY_SECRET_KEY || "").trim();
  if (!base || !apiKey || !secret) {
    throw new Error("Monnify credentials missing in functions env");
  }

  const basic = Buffer.from(`${apiKey}:${secret}`).toString("base64");
  const response = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
    },
  });

  const payload = await response.json().catch(() => ({})) as {
    requestSuccessful?: boolean;
    responseBody?: { accessToken?: string; expiresIn?: number };
  };

  if (!response.ok || !payload.requestSuccessful || !payload.responseBody?.accessToken) {
    throw new Error("Monnify auth failed");
  }

  cachedMonnifyToken = {
    token: payload.responseBody.accessToken,
    expiresAt: Date.now() + Number(payload.responseBody.expiresIn || 0) * 1000,
  };

  return cachedMonnifyToken.token;
}

function resolveMonnifyStatus(value: unknown): "paid" | "manual_check" | "unverified" {
  const status = String(value || "").toUpperCase();
  if (status === "PAID" || status === "SUCCESS" || status === "SUCCESSFUL" || status === "COMPLETED") return "paid";
  if (status === "PENDING" || status === "PROCESSING" || status === "INITIATED" || status === "IN_PROGRESS") return "manual_check";
  return "unverified";
}

async function verifyMonnifyReference(reference: string): Promise<"paid" | "manual_check" | "unverified"> {
  if (!reference) return "unverified";
  const base = String(process.env.MONNIFY_BASE_URL || "").trim();
  if (!base) return "unverified";
  const token = await getMonnifyToken();

  const endpoints = [
    `${base}/api/v2/merchant/transactions/query?paymentReference=${encodeURIComponent(reference)}`,
    `${base}/api/v2/merchant/transactions/query?transactionReference=${encodeURIComponent(reference)}`,
    `${base}/api/v2/transactions/${encodeURIComponent(reference)}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      const payload = await response.json().catch(() => ({})) as {
        requestSuccessful?: boolean;
        responseBody?: { paymentStatus?: unknown; status?: unknown };
      };
      if (!response.ok || !payload.requestSuccessful) continue;
      const state = resolveMonnifyStatus(payload.responseBody?.paymentStatus || payload.responseBody?.status);
      if (state !== "unverified") return state;
    } catch {
      // try next endpoint
    }
  }

  return reference.toUpperCase().startsWith("TX_") || reference.toUpperCase().startsWith("MNFY")
    ? "manual_check"
    : "unverified";
}

async function buildSuccessfulWebhookReferences() {
  const db = admin.firestore();
  const processedWebhookSnap = await db
    .collection("processedWebhooks")
    .where("eventType", "==", "TRANSACTION_COMPLETION")
    .limit(1000)
    .get();

  return new Set(
    processedWebhookSnap.docs
      .filter((doc) => {
        const data = doc.data();
        const status = String(data.status || data.paymentStatus || "").toUpperCase();
        return status === "PAID" || status === "SUCCESS" || status === "SUCCESSFUL" || status === "COMPLETED";
      })
      .flatMap((doc) => {
        const data = doc.data();
        return normalizeReferences([
          data.reference,
          ...(Array.isArray(data.referenceCandidates) ? data.referenceCandidates : []),
        ]).slice(0, 1);
      })
  );
}

function getDateFromFirestoreValue(value: unknown) {
  if (value && typeof value === "object" && "toDate" in (value as Record<string, unknown>)) {
    return ((value as { toDate: () => Date }).toDate());
  }
  return null;
}

function normalizeProofUrls(source: { proofUrl?: unknown; proofUrls?: unknown }) {
  const arrayUrls = Array.isArray(source.proofUrls)
    ? source.proofUrls.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 5)
    : [];
  if (arrayUrls.length > 0) return arrayUrls;
  const single = String(source.proofUrl || "").trim();
  return single ? [single] : [];
}

function extractStoragePathFromUrl(url: string) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("gs://")) {
    const [, ...rest] = trimmed.replace("gs://", "").split("/");
    return rest.length > 0 ? rest.join("/") : null;
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.hostname === "firebasestorage.googleapis.com") {
      const marker = "/o/";
      const markerIndex = parsed.pathname.indexOf(marker);
      if (markerIndex >= 0) {
        const encodedPath = parsed.pathname.slice(markerIndex + marker.length);
        return decodeURIComponent(encodedPath);
      }
    }

    if (parsed.hostname === "storage.googleapis.com") {
      const parts = parsed.pathname.split("/").filter(Boolean);
      return parts.length > 1 ? parts.slice(1).join("/") : null;
    }
  } catch {
    return null;
  }

  return null;
}

async function deleteSubmissionProofsDirect(submission: { proofUrl?: unknown; proofUrls?: unknown }) {
  const urls = normalizeProofUrls(submission);
  if (urls.length === 0) {
    return { deletedCount: 0, failedUrls: [] as string[] };
  }

  const bucketName =
    String(process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
  if (!bucketName) {
    throw new Error("Missing FIREBASE_STORAGE_BUCKET for submission proof cleanup");
  }

  const bucket = admin.storage().bucket(bucketName);
  let deletedCount = 0;
  const failedUrls: string[] = [];

  for (const url of urls) {
    const storagePath = extractStoragePathFromUrl(url);
    if (!storagePath) {
      failedUrls.push(url);
      continue;
    }

    try {
      await bucket.file(storagePath).delete({ ignoreNotFound: true });
      deletedCount += 1;
    } catch (error) {
      console.error("Failed to delete submission proof from storage", { storagePath, error });
      failedUrls.push(url);
    }
  }

  return { deletedCount, failedUrls };
}

async function runDirectSubmissionProofCleanup() {
  const db = admin.firestore();
  const taskRef = db.collection("systemTasks").doc("submissionProofCleanup");
  const now = new Date();
  const cutoff = admin.firestore.Timestamp.fromMillis(now.getTime());
  const CLEANUP_RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const MAX_DOCS_PER_RUN = 100;

  let shouldRun = true;
  await db.runTransaction(async (transaction) => {
    const taskSnap = await transaction.get(taskRef);
    const lastCompletedAt = getDateFromFirestoreValue(taskSnap.data()?.lastCompletedAt);
    if (lastCompletedAt && now.getTime() - lastCompletedAt.getTime() < CLEANUP_RUN_INTERVAL_MS) {
      shouldRun = false;
      return;
    }

    transaction.set(
      taskRef,
      {
        lastStartedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  });

  if (!shouldRun) {
    return {
      success: true,
      skipped: true,
      reason: "Cleanup not due yet",
      scanned: 0,
      deletedSubmissions: 0,
      deletedFiles: 0,
      failedSubmissions: 0,
    };
  }

  const snap = await db
    .collection("earnerSubmissions")
    .where("proofCleanupEligibleAt", "<=", cutoff)
    .limit(MAX_DOCS_PER_RUN)
    .get();

  let deletedSubmissions = 0;
  let deletedFiles = 0;
  let skippedSubmissions = 0;
  let failedSubmissions = 0;

  for (const docSnap of snap.docs) {
    const submission = docSnap.data() as {
      status?: string;
      proofUrl?: unknown;
      proofUrls?: unknown;
      proofCleanupStatus?: string;
      proofsDeletedAt?: unknown;
    };

    const status = String(submission.status || "");
    const alreadyDeleted = Boolean(submission.proofsDeletedAt);
    const cleanupStatus = String(submission.proofCleanupStatus || "").toLowerCase();

    if (!["Verified", "Rejected"].includes(status) || alreadyDeleted || cleanupStatus === "deleted") {
      skippedSubmissions += 1;
      continue;
    }

    try {
      const { deletedCount, failedUrls } = await deleteSubmissionProofsDirect(submission);
      deletedFiles += deletedCount;
      deletedSubmissions += 1;

      await docSnap.ref.set(
        {
          proofUrl: null,
          proofUrls: [],
          proofCleanupStatus: failedUrls.length > 0 ? "partial" : "deleted",
          proofCleanupFailedUrls: failedUrls,
          proofsDeletedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    } catch (error) {
      failedSubmissions += 1;
      console.error("Submission proof cleanup failed", { submissionId: docSnap.id, error });
      await docSnap.ref.set(
        {
          proofCleanupStatus: "failed",
          proofCleanupLastError: error instanceof Error ? error.message : "Unknown cleanup error",
          proofCleanupLastAttemptAt: now,
        },
        { merge: true }
      );
    }
  }

  await taskRef.set(
    {
      lastCompletedAt: now,
      lastRunSummary: {
        scanned: snap.size,
        deletedSubmissions,
        deletedFiles,
        skippedSubmissions,
        failedSubmissions,
      },
      updatedAt: now,
    },
    { merge: true }
  );

  return {
    success: true,
    skipped: false,
    scanned: snap.size,
    deletedSubmissions,
    deletedFiles,
    skippedSubmissions,
    failedSubmissions,
  };
}

async function runDirectAutoVerifySubmissions() {
  const db = admin.firestore();
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
  const EARNER_AUTO_ACTIVATION_THRESHOLD = 2000;
  const AUTO_VERIFY_BATCH_LIMIT = 100;

  const snap = await db
    .collection("earnerSubmissions")
    .where("status", "==", "Pending")
    .where("createdAt", "<=", cutoff)
    .limit(AUTO_VERIFY_BATCH_LIMIT)
    .get();

  if (snap.empty) {
    return {
      success: true,
      processed: 0,
      verified: 0,
      autoRejected: 0,
      skippedFlagged: 0,
      skippedMissingCampaign: 0,
      failed: 0,
      autoActivated: 0,
      expiredCampaigns: 0,
    };
  }

  let verified = 0;
  let autoRejected = 0;
  let skippedFlagged = 0;
  let skippedMissingCampaign = 0;
  let failed = 0;
  const autoActivatedUserIds = new Set<string>();

  for (const sDoc of snap.docs) {
    try {
      const preview = sDoc.data() as Record<string, unknown>;
      const advertiserDecisionStatus = String(preview.advertiserDecisionStatus || "").toLowerCase();
      const legacyAdvertiserFlagStatus = String(preview.advertiserFlagStatus || "").toLowerCase();
      const previewResubmissionStatus = String(preview.resubmissionStatus || "").toLowerCase();
      const previewResubmissionDueAt = getDateFromFirestoreValue((preview as { resubmissionDueAt?: unknown }).resubmissionDueAt);
      if (advertiserDecisionStatus === "resubmission_requested" || previewResubmissionStatus === "pending") {
        if (!previewResubmissionDueAt || previewResubmissionDueAt.getTime() > Date.now()) {
          skippedFlagged += 1;
          continue;
        }
      }
      if (
        advertiserDecisionStatus === "pending" ||
        legacyAdvertiserFlagStatus === "pending" ||
        advertiserDecisionStatus === "approved" ||
        advertiserDecisionStatus === "rejected" ||
        advertiserDecisionStatus === "auto_verified"
      ) {
        skippedFlagged += 1;
        continue;
      }

      const outcome: { value: "verified" | "skipped_flagged" | "skipped_missing_campaign" | "skipped_stale" } = {
        value: "skipped_stale",
      };

      await db.runTransaction(async (t) => {
        const subRef = sDoc.ref;
        const subSnap = await t.get(subRef);
        if (!subSnap.exists) {
          outcome.value = "skipped_stale";
          return;
        }

        const submission = subSnap.data() as Record<string, unknown>;
        if (String(submission.status || "") !== "Pending") {
          outcome.value = "skipped_stale";
          return;
        }

        const submissionDecisionStatus = String(submission.advertiserDecisionStatus || "").toLowerCase();
        const submissionLegacyFlagStatus = String(submission.advertiserFlagStatus || "").toLowerCase();
        if (
          submissionDecisionStatus === "pending" ||
          submissionLegacyFlagStatus === "pending" ||
          submissionDecisionStatus === "approved" ||
          submissionDecisionStatus === "rejected" ||
          submissionDecisionStatus === "auto_verified"
        ) {
          outcome.value = "skipped_flagged";
          return;
        }

        const campaignId = String(submission.campaignId || "");
        if (!campaignId) throw new Error("Submission missing campaignId");

        const campaignRef = db.collection("campaigns").doc(campaignId);
        const campaignSnap = await t.get(campaignRef);
        if (!campaignSnap.exists) {
          outcome.value = "skipped_missing_campaign";
          return;
        }

        const campaign = campaignSnap.data() as Record<string, unknown>;
        const campaignBudget = Number(campaign.budget || 0);
        const campaignReservedBudget = Number(campaign.reservedBudget || 0);
        let earnerAmount = Number(submission.earnerPrice || 0);
        if (!earnerAmount) {
          earnerAmount = Math.round(Number(campaign.costPerLead || 0) / 2) || 0;
        }

        const fullAmount = earnerAmount * 2;
        const reservedAmount = Number(submission.reservedAmount || 0);
        const advertiserId = String(submission.advertiserId || campaign.ownerId || "");
        const submissionUserId = String(submission.userId || "");

        let reservedBudgetAdjustment = 0;
        let reservedToConsume = 0;
        let budgetToConsume = 0;
        let remainingToCover = 0;
        const now = new Date();
        const resubmissionDueAt = getDateFromFirestoreValue((submission as { resubmissionDueAt?: unknown }).resubmissionDueAt);
        const resubmissionExpired =
          String(submission.advertiserDecisionStatus || "").toLowerCase() === "resubmission_requested" &&
          Boolean(resubmissionDueAt) &&
          resubmissionDueAt!.getTime() <= Date.now();

        if (reservedAmount > 0) {
          const pendingSnap = await t.get(
            db
              .collection("earnerSubmissions")
              .where("campaignId", "==", campaignId)
              .where("status", "==", "Pending")
          );
          const expectedReservedBudget = pendingSnap.docs.reduce((sum, pendingDoc) => {
            const pendingData = pendingDoc.data() as Record<string, unknown>;
            return sum + Number(pendingData.reservedAmount || 0);
          }, 0);

          if (expectedReservedBudget > campaignReservedBudget) {
            reservedBudgetAdjustment = expectedReservedBudget - campaignReservedBudget;
          }

          const effectiveReservedBudget = campaignReservedBudget + reservedBudgetAdjustment;
          if (effectiveReservedBudget < reservedAmount) {
            const shortage = reservedAmount - effectiveReservedBudget;
            budgetToConsume = Math.min(campaignBudget, shortage);
            remainingToCover = Math.max(0, shortage - budgetToConsume);
          } else {
            reservedToConsume = reservedAmount;
          }
        } else {
          budgetToConsume = Math.min(campaignBudget, fullAmount);
          remainingToCover = Math.max(0, fullAmount - budgetToConsume);
        }

        if (resubmissionExpired) {
          const finalRejectionReason = "The requested resubmission was not received within 8 hours.";
          if (!submissionUserId) throw new Error("Submission missing userId");
          const earnerRef = db.collection("earners").doc(submissionUserId);
          const earnerSnapshot = await t.get(earnerRef);
          const currentStrikeCount = Number(earnerSnapshot.data()?.strikeCount || 0);
          const nextStrikeCount = currentStrikeCount + 1;
          const shouldSuspend = nextStrikeCount >= 20;

          t.update(subRef, {
            status: "Rejected",
            reviewedAt: now,
            reviewedBy: "system-auto-resubmission-timeout",
            rejectionReason: finalRejectionReason,
            advertiserDecisionStatus: "rejected",
            advertiserDecisionReason: finalRejectionReason,
            advertiserDecisionAt: now,
            advertiserDecisionBy: "system-auto-resubmission-timeout",
            advertiserDecisionSource: "system_auto_resubmission_timeout",
            updatedAt: now,
            finalDecisionAt: now,
            finalDecisionBy: "system-auto-resubmission-timeout",
            finalDecisionSource: "system_auto_resubmission_timeout",
          });

          const earnerUpdates: Record<string, unknown> = {
            strikeCount: nextStrikeCount,
            lastStrikeUpdatedAt: now,
          };
          if (shouldSuspend) {
            earnerUpdates.status = "suspended";
            earnerUpdates.suspensionReason = "Reached 20 rejected submission strikes";
            earnerUpdates.suspendedAt = now;
            earnerUpdates.suspensionCount = Number(earnerSnapshot.data()?.suspensionCount || 0) + 1;
            earnerUpdates.suspensionIndefinite = false;
            earnerUpdates.suspensionReleaseAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
            earnerUpdates.suspensionDurationDays = 3;
          }
          t.set(earnerRef, earnerUpdates, { merge: true });

          if (campaignSnap.exists) {
            const reservedAmt = Number(submission.reservedAmount || 0);
            if (reservedAmt > 0) {
              if (String(campaign.status || "") === "Deleted") {
                t.update(campaignRef, {
                  reservedBudget: admin.firestore.FieldValue.increment(-reservedAmt),
                });
                if (advertiserId) {
                  t.update(db.collection("advertisers").doc(advertiserId), {
                    balance: admin.firestore.FieldValue.increment(reservedAmt),
                  });
                }
              } else {
                t.update(campaignRef, {
                  reservedBudget: admin.firestore.FieldValue.increment(-reservedAmt),
                  budget: admin.firestore.FieldValue.increment(reservedAmt),
                });
              }
            }
          }

          outcome.value = "skipped_stale";
          autoRejected += 1;
          return;
        }

        let advertiserBalance = 0;
        if (remainingToCover > 0 && advertiserId) {
          const advertiserRef = db.collection("advertisers").doc(advertiserId);
          const advertiserSnap = await t.get(advertiserRef);
          advertiserBalance = Number(advertiserSnap.data()?.balance || 0);
        }

        if (remainingToCover > 0 && advertiserBalance < remainingToCover) {
          throw new Error("Reserved funds for this submission are no longer available and advertiser balance cannot cover the difference");
        }

        const reviewNow = new Date();
        const userId = String(submission.userId || "");
        if (!userId) throw new Error("Submission missing userId");

        const earnerRef = db.collection("earners").doc(userId);
        const liveEarnerSnap = await t.get(earnerRef);
        const liveEarnerData = liveEarnerSnap.data() as { balance?: number; activated?: boolean } | undefined;
        const earnerCurrentBalance = Number(liveEarnerData?.balance || 0);
        const earnerIsActivated = Boolean(liveEarnerData?.activated);
        const shouldAutoActivate =
          !earnerIsActivated &&
          earnerCurrentBalance + earnerAmount >= EARNER_AUTO_ACTIVATION_THRESHOLD;
        const activationDeduction = shouldAutoActivate ? EARNER_AUTO_ACTIVATION_THRESHOLD : 0;
        const netEarning = earnerAmount - activationDeduction;

        t.update(subRef, {
          status: "Verified",
          reviewedAt: reviewNow,
          reviewedBy: "system-auto-verify",
          rejectionReason: null,
          advertiserDecisionStatus: "auto_verified",
          advertiserDecisionReason: null,
          advertiserDecisionAt: reviewNow,
          advertiserDecisionBy: "system-auto-verify",
          advertiserDecisionSource: "system_auto_verify",
          updatedAt: reviewNow,
          finalDecisionAt: reviewNow,
          finalDecisionBy: "system-auto-verify",
          finalDecisionSource: "system_auto_verify",
          autoVerified: true,
        });

        const estimated = Number(campaign.estimatedLeads || 0);
        const completedLeads = Number(campaign.generatedLeads || 0) + 1;
        const completionRate = estimated > 0 ? (completedLeads / estimated) * 100 : 0;
        const campaignUpdates: Record<string, unknown> = {
          generatedLeads: admin.firestore.FieldValue.increment(1),
          completedLeads: admin.firestore.FieldValue.increment(1),
          lastLeadAt: reviewNow,
          completionRate,
          dailySubmissionCount: admin.firestore.FieldValue.increment(1),
          lastUpdated: reviewNow,
        };
        if (reservedBudgetAdjustment !== 0 || reservedToConsume > 0) {
          campaignUpdates.reservedBudget = admin.firestore.FieldValue.increment(reservedBudgetAdjustment - reservedToConsume);
        }
        if (budgetToConsume > 0) {
          campaignUpdates.budget = admin.firestore.FieldValue.increment(-budgetToConsume);
        }
        if (completionRate >= 100 && String(campaign.status || "") !== "Deleted") {
          campaignUpdates.status = "Completed";
        }
        t.update(campaignRef, campaignUpdates);

        const earnerTxRef = db.collection("earnerTransactions").doc();
        t.set(earnerTxRef, {
          userId,
          campaignId,
          type: "credit",
          amount: earnerAmount,
          status: "completed",
          note: `Payment for ${String(submission.campaignTitle || "")}`,
          createdAt: reviewNow,
        });

        if (shouldAutoActivate) {
          const activationTxRef = db.collection("earnerTransactions").doc();
          t.set(activationTxRef, {
            userId,
            campaignId,
            type: "activation_fee",
            amount: -activationDeduction,
            status: "completed",
            note: "Automatic account activation from wallet earnings",
            createdAt: reviewNow,
          });
          autoActivatedUserIds.add(userId);
        }

        const earnerUpdates: Record<string, unknown> = {
          balance: admin.firestore.FieldValue.increment(netEarning),
          leadsPaidFor: admin.firestore.FieldValue.increment(1),
          totalEarned: admin.firestore.FieldValue.increment(earnerAmount),
          lastEarnedAt: reviewNow,
        };
        if (shouldAutoActivate) {
          earnerUpdates.activated = true;
          earnerUpdates.activatedAt = reviewNow;
          earnerUpdates.activationPaymentProvider = "wallet_auto";
          earnerUpdates.pendingActivationProvider = admin.firestore.FieldValue.delete();
          earnerUpdates.pendingActivationReference = admin.firestore.FieldValue.delete();
          earnerUpdates.needsReactivation = false;
        }
        t.update(earnerRef, earnerUpdates);

        if (advertiserId) {
          const advTxRef = db.collection("advertiserTransactions").doc();
          t.set(advTxRef, {
            userId: advertiserId,
            campaignId,
            type: "debit",
            amount: fullAmount,
            status: "completed",
            note: `Payment for lead in ${String(submission.campaignTitle || "")}`,
            createdAt: reviewNow,
          });
          const advertiserUpdates: Record<string, unknown> = {
            totalSpent: admin.firestore.FieldValue.increment(fullAmount),
            leadsGenerated: admin.firestore.FieldValue.increment(1),
            lastLeadAt: reviewNow,
          };
          if (remainingToCover > 0) {
            advertiserUpdates.balance = admin.firestore.FieldValue.increment(-remainingToCover);
          }
          t.update(db.collection("advertisers").doc(advertiserId), advertiserUpdates);
        }

        outcome.value = "verified";
      });

      if (outcome.value === "verified") {
        verified += 1;
      } else if (outcome.value === "skipped_flagged") {
        skippedFlagged += 1;
      } else if (outcome.value === "skipped_missing_campaign") {
        skippedMissingCampaign += 1;
      }
    } catch (error) {
      failed += 1;
      console.error("[functions][auto-verify] failed for submission", sDoc.id, error);
    }
  }

  for (const userId of autoActivatedUserIds) {
    try {
      await callInternalRoute("/api/internal/process-pending-referrals");
    } catch (error) {
      console.error("[functions][auto-verify] referral payout failed for auto-activated earner", { userId, error });
    }
  }

  let expiredCampaigns = 0;
  const nowTs = admin.firestore.Timestamp.fromMillis(Date.now());
  const expiredCampaignSnap = await db
    .collection("campaigns")
    .where("status", "==", "Active")
    .where("expiresAt", "<=", nowTs)
    .limit(AUTO_VERIFY_BATCH_LIMIT)
    .get();

  for (const campaignDoc of expiredCampaignSnap.docs) {
    try {
      await db.runTransaction(async (t) => {
        const campaignRef = campaignDoc.ref;
        const campaignSnap = await t.get(campaignRef);
        if (!campaignSnap.exists) return;

        const campaign = campaignSnap.data() as Record<string, unknown>;
        if (String(campaign.status || "") !== "Active") return;
        const expiresAtDate = getDateFromFirestoreValue((campaign as { expiresAt?: unknown }).expiresAt);
        if (!expiresAtDate || expiresAtDate.getTime() > Date.now()) return;

        const ownerId = String(campaign.ownerId || "");
        const refundAmount = Math.max(0, Math.floor(Number(campaign.budget || 0) + Number(campaign.reservedBudget || 0)));

        t.update(campaignRef, {
          status: "Expired",
          budget: 0,
          reservedBudget: 0,
          expiredAt: nowTs,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        if (ownerId && refundAmount > 0) {
          t.update(db.collection("advertisers").doc(ownerId), {
            balance: admin.firestore.FieldValue.increment(refundAmount),
          });
        }
      });
      expiredCampaigns += 1;
    } catch (error) {
      console.error("[functions][auto-verify] failed to expire campaign", campaignDoc.id, error);
    }
  }

  return {
    success: true,
    processed: snap.size,
    verified,
    autoRejected,
    skippedFlagged,
    skippedMissingCampaign,
    failed,
    autoActivated: autoActivatedUserIds.size,
    expiredCampaigns,
  };
}

async function resolveReferencesPaidState(
  references: string[],
  successfulWebhookReferences: Set<string>,
  verificationCache: Map<string, Promise<"paid" | "manual_check" | "unverified">>,
) {
  if (references.some((reference) => successfulWebhookReferences.has(reference))) return "paid" as const;

  let sawManual = false;
  for (const reference of references) {
    let verification = verificationCache.get(reference);
    if (!verification) {
      verification = verifyMonnifyReference(reference);
      verificationCache.set(reference, verification);
    }
    const state = await verification;
    if (state === "paid") return "paid" as const;
    if (state === "manual_check") sawManual = true;
  }
  return sawManual ? "manual_check" as const : "unverified" as const;
}

async function runDirectRecoverySweep() {
  const db = admin.firestore();
  const now = Date.now();
  const verificationCache = new Map<string, Promise<"paid" | "manual_check" | "unverified">>();
  const [walletSourceSnap, activationSourceSnap, successfulWebhookReferences] = await Promise.all([
    db.collection("advertiserTransactions").orderBy("createdAt", "desc").limit(500).get(),
    db.collection("activationAttempts").orderBy("createdAt", "desc").limit(500).get(),
    buildSuccessfulWebhookReferences(),
  ]);

  const pendingWalletDocs = walletSourceSnap.docs
    .filter((doc) => {
      const data = doc.data();
      return String(data.type || "").toLowerCase() === "wallet_funding" &&
        String(data.status || "").toLowerCase() === "pending";
    })
    .slice(0, 50);

  const pendingActivationDocs = activationSourceSnap.docs
    .filter((doc) => String(doc.data().status || "").toLowerCase() === "pending")
    .slice(0, 50);

  let activationRecovered = 0;
  let walletRecovered = 0;
  let activationDeferred = 0;
  let walletDeferred = 0;

  for (const doc of pendingActivationDocs) {
    const data = doc.data();
    if (Boolean(data.recoveryAutoChecksLocked)) continue;
    if (String(data.recoveryDisposition || "").toLowerCase() === "manual_review") continue;
    const nextCheckAt = getDateFromFirestoreValue(data.nextRecoveryCheckAt);
    if (nextCheckAt && nextCheckAt.getTime() > now) continue;

    const references = normalizeReferences([
      data.reference,
      ...(Array.isArray(data.references) ? data.references : []),
      data.pendingReference,
    ]);
    if (references.length === 0) continue;

    const retryCount = Number(data.recoveryRetryCount || 0);
    if (retryCount === 0) {
      await doc.ref.set({
        lastRecoveryCheckedAt: new Date(),
        recoveryRetryCount: 0,
        recoveryDisposition: "scheduled",
        nextRecoveryCheckAt: new Date(Date.now() + 90_000),
      }, { merge: true });
      activationDeferred += 1;
      continue;
    }

    const verificationState = await resolveReferencesPaidState(references, successfulWebhookReferences, verificationCache);
    if (verificationState === "paid") {
      try {
        await callLegacyNextInternalPostRoute("/api/internal/process-activation", {
          userId: String(data.userId || ""),
          role: String(data.role || "").toLowerCase() === "advertiser" ? "advertiser" : "earner",
          provider: String(data.provider || "monnify"),
          reference: references[0],
          references,
          amount: Number(data.amount || 2000),
        });
        await doc.ref.set({
          lastRecoveryCheckedAt: new Date(),
          lastRecoveryVerificationState: "paid",
          recoveryDisposition: "completed",
          nextRecoveryCheckAt: admin.firestore.FieldValue.delete(),
          recoveryAutoChecksLocked: false,
        }, { merge: true });
        activationRecovered += 1;
      } catch (error) {
        console.error("[functions][recovery-direct] activation processing failed", { docId: doc.id, error });
      }
      continue;
    }

    const nextRetryCount = retryCount + 1;
    const lock = nextRetryCount >= 4;
    await doc.ref.set({
      lastRecoveryCheckedAt: new Date(),
      lastRecoveryVerificationState: verificationState,
      recoveryRetryCount: nextRetryCount,
      recoveryDisposition: lock ? "manual_review" : "scheduled",
      nextRecoveryCheckAt: lock ? admin.firestore.FieldValue.delete() : new Date(Date.now() + 5 * 60 * 1000),
      recoveryAutoChecksLocked: lock,
    }, { merge: true });
    activationDeferred += 1;
  }

  for (const doc of pendingWalletDocs) {
    const data = doc.data();
    if (Boolean(data.recoveryAutoChecksLocked)) continue;
    if (String(data.recoveryDisposition || "").toLowerCase() === "manual_review") continue;
    const nextCheckAt = getDateFromFirestoreValue(data.nextRecoveryCheckAt);
    if (nextCheckAt && nextCheckAt.getTime() > now) continue;

    const references = normalizeReferences([
      data.reference,
      ...(Array.isArray(data.referenceCandidates) ? data.referenceCandidates : []),
    ]);
    if (references.length === 0) continue;

    const retryCount = Number(data.recoveryRetryCount || 0);
    if (retryCount === 0) {
      await doc.ref.set({
        lastRecoveryCheckedAt: new Date(),
        recoveryRetryCount: 0,
        recoveryDisposition: "scheduled",
        nextRecoveryCheckAt: new Date(Date.now() + 90_000),
      }, { merge: true });
      walletDeferred += 1;
      continue;
    }

    const verificationState = await resolveReferencesPaidState(references, successfulWebhookReferences, verificationCache);
    if (verificationState === "paid") {
      try {
        await callLegacyNextInternalPostRoute("/api/internal/process-wallet-funding", {
          userId: String(data.userId || ""),
          role: "advertiser",
          provider: String(data.provider || "monnify"),
          reference: references[0],
          references,
          amount: Number(data.amount || 0),
        });
        await doc.ref.set({
          lastRecoveryCheckedAt: new Date(),
          lastRecoveryVerificationState: "paid",
          verificationState: "paid",
          recoveryDisposition: "completed",
          nextRecoveryCheckAt: admin.firestore.FieldValue.delete(),
          recoveryAutoChecksLocked: false,
        }, { merge: true });
        walletRecovered += 1;
      } catch (error) {
        console.error("[functions][recovery-direct] wallet processing failed", { docId: doc.id, error });
      }
      continue;
    }

    const nextRetryCount = retryCount + 1;
    const lock = nextRetryCount >= 4;
    await doc.ref.set({
      lastRecoveryCheckedAt: new Date(),
      lastRecoveryVerificationState: verificationState,
      verificationState,
      recoveryRetryCount: nextRetryCount,
      recoveryDisposition: lock ? "manual_review" : "scheduled",
      nextRecoveryCheckAt: lock ? admin.firestore.FieldValue.delete() : new Date(Date.now() + 5 * 60 * 1000),
      recoveryAutoChecksLocked: lock,
    }, { merge: true });
    walletDeferred += 1;
  }

  return {
    success: true,
    activationRecovered,
    walletRecovered,
    checked: {
      activation: pendingActivationDocs.length,
      wallet: pendingWalletDocs.length,
    },
    deferred: {
      activation: activationDeferred,
      wallet: walletDeferred,
    },
  };
}

function referencesChanged(beforeData: Record<string, unknown> | undefined, afterData: Record<string, unknown> | undefined) {
  const beforeRefs = normalizeReferences([
    beforeData?.reference,
    ...(Array.isArray(beforeData?.referenceCandidates) ? beforeData?.referenceCandidates : []),
    ...(Array.isArray(beforeData?.references) ? beforeData?.references : []),
    beforeData?.pendingReference,
  ]);
  const afterRefs = normalizeReferences([
    afterData?.reference,
    ...(Array.isArray(afterData?.referenceCandidates) ? afterData?.referenceCandidates : []),
    ...(Array.isArray(afterData?.references) ? afterData?.references : []),
    afterData?.pendingReference,
  ]);

  if (afterRefs.length !== beforeRefs.length) return true;
  const beforeSet = new Set(beforeRefs);
  return afterRefs.some((ref) => !beforeSet.has(ref));
}

// Trigger recovery when a NEW wallet funding transaction is CREATED with pending status
export const wakeRecoveryOnCreatedWalletFunding = onDocumentCreated("advertiserTransactions/{transactionId}", async (event) => {
  const data = event.data?.data() as Record<string, unknown> | undefined;

  if (!data) return;

  const type = String(data.type || "").toLowerCase();
  const status = String(data.status || "").toLowerCase();

  // If this is a NEW wallet_funding transaction with pending status, trigger recovery immediately
  if (type === "wallet_funding" && status === "pending") {
    console.log(`[trigger] Detected NEW pending wallet funding: ${event.params.transactionId}, triggering immediate recovery`);
    await callInternalRoute("/api/internal/recovery-sweep");
    return;
  }
});

// Trigger recovery when a NEW activation attempt is CREATED with pending status
export const wakeRecoveryOnCreatedActivation = onDocumentCreated("activationAttempts/{attemptId}", async (event) => {
  const data = event.data?.data() as Record<string, unknown> | undefined;

  if (!data) return;

  const status = String(data.status || "").toLowerCase();

  // If this is a NEW activation attempt with pending status, trigger recovery immediately
  if (status === "pending") {
    console.log(`[trigger] Detected NEW pending activation: ${event.params.attemptId}, triggering immediate recovery`);
    await callInternalRoute("/api/internal/recovery-sweep");
    return;
  }
});

async function wakeRecoverySweepIfNeeded(beforeData: Record<string, unknown> | undefined, afterData: Record<string, unknown> | undefined) {
  const beforeDisposition = String(beforeData?.recoveryDisposition || "").toLowerCase();
  const afterDisposition = String(afterData?.recoveryDisposition || "").toLowerCase();
  if (afterDisposition !== "manual_review" || beforeDisposition === "manual_review") {
    return;
  }

  await callInternalRoute("/api/internal/recovery-sweep");
}

// Immediately trigger recovery when a pending wallet funding transaction is created or marked as pending
export const wakeRecoveryOnPendingWalletFunding = onDocumentUpdated("advertiserTransactions/{transactionId}", async (event) => {
  const beforeData = event.data?.before.exists ? (event.data.before.data() as Record<string, unknown>) : undefined;
  const afterData = event.data?.after.exists ? (event.data.after.data() as Record<string, unknown>) : undefined;

  if (!afterData) return;

  const beforeStatus = String(beforeData?.status || "").toLowerCase();
  const afterStatus = String(afterData?.status || "").toLowerCase();
  const type = String(afterData?.type || "").toLowerCase();

  const refsDidChange = referencesChanged(beforeData, afterData);

  // Trigger recovery when wallet funding becomes pending OR when new reference data arrives while pending.
  if (type === "wallet_funding" && afterStatus === "pending" && (beforeStatus !== "pending" || refsDidChange)) {
    console.log(`[trigger] Detected new pending wallet funding: ${event.params.transactionId}, triggering immediate recovery`);
    await callInternalRoute("/api/internal/recovery-sweep");
    return;
  }

  // Also check for manual_review disposition change
  await wakeRecoverySweepIfNeeded(beforeData, afterData);
});

// Immediately trigger recovery when an activation attempt is created or marked as pending
export const wakeRecoveryOnPendingActivation = onDocumentUpdated("activationAttempts/{attemptId}", async (event) => {
  const beforeData = event.data?.before.exists ? (event.data.before.data() as Record<string, unknown>) : undefined;
  const afterData = event.data?.after.exists ? (event.data.after.data() as Record<string, unknown>) : undefined;

  if (!afterData) return;

  const beforeStatus = String(beforeData?.status || "").toLowerCase();
  const afterStatus = String(afterData?.status || "").toLowerCase();

  const refsDidChange = referencesChanged(beforeData, afterData);

  // Trigger recovery when activation becomes pending OR when new reference data arrives while pending.
  if (afterStatus === "pending" && (beforeStatus !== "pending" || refsDidChange)) {
    console.log(`[trigger] Detected new pending activation: ${event.params.attemptId}, triggering immediate recovery`);
    await callInternalRoute("/api/internal/recovery-sweep");
    return;
  }

  // Also check for manual_review disposition change
  await wakeRecoverySweepIfNeeded(beforeData, afterData);
});

export const wakeRecoveryOnActivationReview = onDocumentUpdated("activationAttempts/{attemptId}", async (event) => {
  await wakeRecoverySweepIfNeeded(
    event.data?.before.exists ? (event.data.before.data() as Record<string, unknown>) : undefined,
    event.data?.after.exists ? (event.data.after.data() as Record<string, unknown>) : undefined
  );
});

export const wakeRecoveryOnWalletReview = onDocumentUpdated("advertiserTransactions/{transactionId}", async (event) => {
  await wakeRecoverySweepIfNeeded(
    event.data?.before.exists ? (event.data.before.data() as Record<string, unknown>) : undefined,
    event.data?.after.exists ? (event.data.after.data() as Record<string, unknown>) : undefined
  );
});

export const mailerApi = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ success: false, message: "Method not allowed" });
    return;
  }

  const expectedSecret = String(process.env.MAILER_API_SECRET || "").trim();
  if (!expectedSecret) {
    res.status(500).json({ success: false, message: "MAILER_API_SECRET is not configured" });
    return;
  }

  const incomingSecret = String(req.headers["x-mailer-secret"] || "").trim();
  if (!incomingSecret || incomingSecret !== expectedSecret) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  const body = (req.body || {}) as { to?: string; subject?: string; html?: string };
  const to = String(body.to || "").trim();
  const subject = String(body.subject || "").trim();
  const html = String(body.html || "").trim();
  const from = String(process.env.SMTP_FROM || "").trim();

  if (!to || !subject || !html) {
    res.status(400).json({ success: false, message: "to, subject, and html are required" });
    return;
  }

  if (!from) {
    res.status(500).json({ success: false, message: "SMTP_FROM is not configured" });
    return;
  }

  try {
    const transporter = getSmtpTransporter();
    const result = await transporter.sendMail({ from, to, subject, html });
    res.status(200).json({
      success: true,
      messageId: result.messageId || null,
      accepted: Array.isArray(result.accepted) ? result.accepted.length : 0,
      rejected: Array.isArray(result.rejected) ? result.rejected.length : 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[mailerApi] send failed", { to, subject, error: message });
    res.status(500).json({ success: false, message });
  }
});

export const internalApi = onRequest({ invoker: "public" }, async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ success: false, message: "Method not allowed" });
    return;
  }

  if (!isAuthorizedInternalRequest(req.headers.authorization)) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  const path = String(req.path || "");
  const requestPayload = req.method === "POST"
    ? (typeof req.body === "object" && req.body ? req.body : {})
    : (req.query || {});

  // First real offloaded endpoint (runs fully on Functions, not on Vercel).
  if (path === "/api/internal/process-pending-referrals") {
    try {
      const result = await processPendingReferralsDirect();
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to process pending referrals",
      });
    }
    return;
  }

  // Bridge mode: route still executes on Next local handler, but avoids proxy recursion.
  if (path === "/api/internal/recovery-sweep") {
    const useDirectSweep = String(process.env.FUNCTIONS_DIRECT_RECOVERY_SWEEP || "1").trim() !== "0";
    try {
      const result = useDirectSweep
        ? await runDirectRecoverySweep()
        : await callLegacyNextInternalRoute("/api/internal/recovery-sweep");
      res.status(200).json(result);
    } catch (error) {
      // Safety fallback during migration: if direct sweep fails, run the legacy route.
      try {
        const fallbackResult = await callLegacyNextInternalRoute("/api/internal/recovery-sweep");
        res.status(200).json({
          ...fallbackResult,
          fallbackUsed: true,
        });
      } catch (fallbackError) {
        res.status(500).json({
          success: false,
          message: fallbackError instanceof Error ? fallbackError.message : "Failed to run recovery sweep",
          originalError: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return;
  }

  // Bridge mode for auto-verify while direct offload is prepared.
  if (path === "/api/internal/auto-verify-submissions") {
    try {
      const result = await runDirectAutoVerifySubmissions();
      res.status(200).json(result);
    } catch (error) {
      try {
        const fallbackResult = await callLegacyNextInternalRoute("/api/internal/auto-verify-submissions");
        res.status(200).json({
          ...fallbackResult,
          fallbackUsed: true,
        });
      } catch (fallbackError) {
        res.status(500).json({
          success: false,
          message: fallbackError instanceof Error ? fallbackError.message : "Failed to run auto-verify submissions",
          originalError: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return;
  }

  if (path === "/api/internal/submission-proof-cleanup") {
    const useDirectCleanup = String(process.env.FUNCTIONS_DIRECT_SUBMISSION_CLEANUP || "1").trim() !== "0";
    try {
      const result = useDirectCleanup
        ? await runDirectSubmissionProofCleanup()
        : await callLegacyNextInternalRoute("/api/internal/submission-proof-cleanup");
      res.status(200).json(result);
    } catch (error) {
      try {
        const fallbackResult = await callLegacyNextInternalRoute("/api/internal/submission-proof-cleanup");
        res.status(200).json({
          ...fallbackResult,
          fallbackUsed: true,
        });
      } catch (fallbackError) {
        res.status(500).json({
          success: false,
          message: fallbackError instanceof Error ? fallbackError.message : "Failed to run submission proof cleanup",
          originalError: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return;
  }

  // Dedicated activation processor route (cron-protected in Next).
  if (path === "/api/internal/process-activation") {
    try {
      const targetUrl = `${APP_BASE_URL.replace(/\/$/, "")}/api/internal/process-activation`;
      const headers = buildHeaders();
      headers["x-skip-backend-proxy"] = "1";
      headers["Content-Type"] = "application/json";

      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestPayload),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(`status ${response.status}: ${JSON.stringify(payload)}`);
      }
      res.status(200).json(payload);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to process activation",
      });
    }
    return;
  }

  // Dedicated wallet funding processor route (cron-protected in Next).
  if (path === "/api/internal/process-wallet-funding") {
    try {
      const targetUrl = `${APP_BASE_URL.replace(/\/$/, "")}/api/internal/process-wallet-funding`;
      const headers = buildHeaders();
      headers["x-skip-backend-proxy"] = "1";
      headers["Content-Type"] = "application/json";

      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestPayload),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(`status ${response.status}: ${JSON.stringify(payload)}`);
      }
      res.status(200).json(payload);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to process wallet funding",
      });
    }
    return;
  }

  // Other routes can be moved one-by-one; keep explicit not-ready response so Next can fallback safely.
  res.status(501).json({
    success: false,
    message: `Route not offloaded yet: ${path}`,
  });
});
