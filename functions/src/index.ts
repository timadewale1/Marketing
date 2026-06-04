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
