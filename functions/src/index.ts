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

function buildHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (process.env.CRON_SECRET) {
    headers.Authorization = `Bearer ${process.env.CRON_SECRET}`;
  }

  return headers;
}

async function callInternalRoute(path: string) {
  const targetUrl = `${APP_BASE_URL.replace(/\/$/, "")}${path}`;
  const response = await fetch(targetUrl, {
    method: "GET",
    headers: buildHeaders(),
  });

  const payload = await response.json().catch(() => ({}));
  console.log(`[scheduler] ${path}`, {
    ok: response.ok,
    status: response.status,
    payload,
  });

  if (!response.ok) {
    throw new Error(`Scheduled call failed for ${path} with status ${response.status}`);
  }

  return payload;
}

function isAuthorizedInternalRequest(authHeader: string | undefined) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
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
  await callInternalRoute("/api/internal/auto-verify-submissions");
});

export const retryPendingMonnifyPayments = onSchedule("every 5 minutes", async () => {
  await callInternalRoute("/api/internal/recovery-sweep");
});

function normalizeReferences(values: unknown[]) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
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

export const internalApi = onRequest(async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ success: false, message: "Method not allowed" });
    return;
  }

  if (!isAuthorizedInternalRequest(req.headers.authorization)) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  const path = String(req.path || "");

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

  // Other routes can be moved one-by-one; keep explicit not-ready response so Next can fallback safely.
  res.status(501).json({
    success: false,
    message: `Route not offloaded yet: ${path}`,
  });
});
