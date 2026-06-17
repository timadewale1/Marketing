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

  const projectId = String(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "").trim();
  if (projectId) {
    return `https://us-central1-${projectId}.cloudfunctions.net/internalApi`;
  }

  return "";
}

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
  const headers = buildHeaders();
  const internalBase = getInternalApiBaseUrl();
  const appBase = APP_BASE_URL.replace(/\/$/, "");
  const targetCandidates = internalBase
    ? [`${internalBase}${path}`, `${appBase}${path}`]
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
  const headers = buildHeaders();
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
  const headers = buildHeaders();
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

export const internalApi = onRequest(async (req, res) => {
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
      const result = await callLegacyNextInternalRoute("/api/internal/auto-verify-submissions");
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to run auto-verify submissions",
      });
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
