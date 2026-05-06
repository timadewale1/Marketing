import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";

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

export const autoVerifySubmissions = functions.pubsub.schedule("every 60 minutes").onRun(async () => {
  await callInternalRoute("/api/internal/auto-verify-submissions");
});

export const retryPendingMonnifyPayments = functions.pubsub.schedule("every 5 minutes").onRun(async () => {
  await callInternalRoute("/api/internal/recovery-sweep");
});
