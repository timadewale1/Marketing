import type { NextRequest } from "next/server"
import * as monnify from "@/services/monnify"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

type SupportedPaymentProvider = "monnify"

export async function resolveActorUserIdFromRequest(request: Request | NextRequest) {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) return undefined

  const idToken = authHeader.split("Bearer ")[1]
  if (!idToken) return undefined

  const { admin } = await initFirebaseAdmin()
  if (!admin) return undefined

  try {
    const decoded = await admin.auth().verifyIdToken(idToken)
    return decoded.uid
  } catch (error) {
    console.warn("Failed to resolve authenticated bills actor", error)
    return undefined
  }
}

export async function verifyExternalBillsPayment({
  provider,
  reference,
  expectedAmount,
}: {
  provider?: string | null
  reference?: string | null
  expectedAmount: number
}) {
  const normalizedProvider = String(provider || "").trim().toLowerCase()
  const paymentReference = String(reference || "").trim()

  if (!normalizedProvider || !paymentReference) {
    throw new Error("Missing payment verification details")
  }

  if (normalizedProvider === "monnify") {
    const verification = await monnify.verifyTransaction(paymentReference)
    if (!verification?.requestSuccessful) {
      throw new Error("Payment verification failed")
    }

    const responseBody = (verification.responseBody || {}) as Record<string, unknown>
    const paymentStatus = String(responseBody.paymentStatus || responseBody.status || "").toUpperCase()
    if (paymentStatus !== "PAID" && paymentStatus !== "SUCCESSFUL" && paymentStatus !== "SUCCESS") {
      throw new Error("Payment not successful")
    }

    const rawAmount = Number(responseBody.amountPaid || responseBody.amount || 0)
    const paidAmount = rawAmount > 100000 ? rawAmount / 100 : rawAmount
    if (expectedAmount > 0 && paidAmount < expectedAmount) {
      throw new Error("Paid amount does not match expected amount")
    }

    return {
      provider: "monnify" as SupportedPaymentProvider,
      paidAmount,
      verificationData: responseBody,
    }
  }

  throw new Error("Unsupported payment provider")
}
