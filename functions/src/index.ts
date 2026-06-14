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
