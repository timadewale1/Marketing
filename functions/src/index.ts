import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/scheduler";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

admin.initializeApp();

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

export const retryPendingMonnifyPayments = onSchedule("every 6 hours", async () => {
  await callInternalRoute("/api/internal/recovery-sweep");
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

  // If this is a wallet_funding transaction that just became pending, trigger recovery immediately
  if (type === "wallet_funding" && afterStatus === "pending" && beforeStatus !== "pending") {
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

  // If this is an activation attempt that just became pending, trigger recovery immediately
  if (afterStatus === "pending" && beforeStatus !== "pending") {
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
