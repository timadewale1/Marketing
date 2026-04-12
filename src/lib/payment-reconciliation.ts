import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

type ReconciliationScope = "activation" | "wallet_funding" | "campaign_payment" | "recovery"
type ReconciliationStatus =
  | "registered"
  | "callback_received"
  | "pending_confirmation"
  | "confirmed"
  | "completed"
  | "webhook_received"
  | "webhook_processed"
  | "retry_started"
  | "retry_completed"
  | "retry_failed"
  | "manual_check"
  | "matched"
  | "failed"

type LogPaymentLifecycleInput = {
  scope: ReconciliationScope
  status: ReconciliationStatus
  source: string
  provider?: string | null
  role?: string | null
  userId?: string | null
  email?: string | null
  reference?: string | null
  references?: string[]
  amount?: number | null
  transactionId?: string | null
  details?: Record<string, unknown>
}

function normalizeReferences(reference: string | null | undefined, references: string[] = []) {
  return [...new Set([reference, ...references].map((value) => String(value || "").trim()).filter(Boolean))]
}

export async function logPaymentLifecycle(input: LogPaymentLifecycleInput) {
  try {
    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) return

    const references = normalizeReferences(input.reference, input.references)
    await dbAdmin.collection("paymentReconciliationLogs").add({
      scope: input.scope,
      status: input.status,
      source: input.source,
      provider: input.provider || null,
      role: input.role || null,
      userId: input.userId || null,
      email: String(input.email || "").trim().toLowerCase() || null,
      reference: references[0] || null,
      references,
      amount: typeof input.amount === "number" ? input.amount : null,
      transactionId: input.transactionId || null,
      details: input.details || {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  } catch (error) {
    console.warn("[payment-reconciliation] failed to log lifecycle event", error)
  }
}
