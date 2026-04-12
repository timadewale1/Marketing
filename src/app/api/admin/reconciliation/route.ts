import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/admin-session"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

function serializeDate(value: unknown) {
  if (value && typeof value === "object" && "toDate" in (value as Record<string, unknown>)) {
    return ((value as { toDate: () => Date }).toDate()).toISOString()
  }
  if (value instanceof Date) return value.toISOString()
  return value ?? null
}

export async function GET(): Promise<Response> {
  const adminSession = await requireAdminSession()
  if ("errorResponse" in adminSession) {
    return adminSession.errorResponse as Response
  }

  const { dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin) {
    return NextResponse.json({ success: false, message: "Server admin unavailable" }, { status: 500 })
  }

  const staleCutoff = Date.now() - 15 * 60 * 1000

  const [activationAttemptsSnap, pendingWalletSnap] = await Promise.all([
    dbAdmin.collection("activationAttempts").get(),
    dbAdmin.collection("advertiserTransactions")
      .where("type", "==", "wallet_funding")
      .where("status", "==", "pending")
      .get(),
  ])

  const staleActivations = activationAttemptsSnap.docs
    .map((doc) => {
      const data = doc.data()
      const attemptedAtRaw = data.attemptedAt || data.updatedAt
      const attemptedAt = serializeDate(attemptedAtRaw)
      const attemptedAtMs = attemptedAt ? Date.parse(String(attemptedAt)) : NaN
      return {
        id: doc.id,
        userId: String(data.userId || ""),
        role: String(data.role || ""),
        email: String(data.email || ""),
        name: String(data.name || ""),
        provider: String(data.provider || ""),
        status: String(data.status || ""),
        reference: String(data.reference || ""),
        references: Array.isArray(data.references) ? data.references.map(String) : [],
        attemptedAt,
        staleMinutes: Number.isFinite(attemptedAtMs) ? Math.floor((Date.now() - attemptedAtMs) / 60000) : null,
      }
    })
    .filter((item) => item.userId && item.status.toLowerCase() !== "completed")
    .filter((item) => item.staleMinutes === null || item.staleMinutes >= 15)
    .sort((a, b) => (b.staleMinutes || 0) - (a.staleMinutes || 0))
    .slice(0, 30)

  const staleWallets = pendingWalletSnap.docs
    .map((doc) => {
      const data = doc.data()
      const createdAt = serializeDate(data.createdAt)
      const createdAtMs = createdAt ? Date.parse(String(createdAt)) : NaN
      return {
        id: doc.id,
        userId: String(data.userId || ""),
        amount: Number(data.amount || 0),
        provider: String(data.provider || ""),
        reference: String(data.reference || ""),
        references: Array.isArray(data.referenceCandidates) ? data.referenceCandidates.map(String) : [],
        verificationState: String(data.verificationState || ""),
        createdAt,
        staleMinutes: Number.isFinite(createdAtMs) ? Math.floor((Date.now() - createdAtMs) / 60000) : null,
      }
    })
    .filter((item) => item.userId)
    .filter((item) => item.staleMinutes === null || item.staleMinutes >= 15)
    .sort((a, b) => (b.staleMinutes || 0) - (a.staleMinutes || 0))
    .slice(0, 30)

  return NextResponse.json({
    success: true,
    staleActivations,
    staleWallets,
    staleCutoffIso: new Date(staleCutoff).toISOString(),
  })
}
