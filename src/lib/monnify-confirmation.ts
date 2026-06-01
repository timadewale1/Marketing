import { extractMonnifyReferenceCandidates } from "@/lib/monnify-reference"
import { verifyTransaction } from "@/services/monnify"

type ConfirmationResult = {
  confirmed: boolean
  references: string[]
  paymentStatus: string | null
  verificationResult: Record<string, unknown> | null
}

const DEFAULT_RETRY_DELAYS_MS = [0, 4000, 12000]

function isConfirmedPaymentStatus(value: unknown) {
  const status = String(value || "").toUpperCase()
  return status === "PAID" || status === "SUCCESS" || status === "SUCCESSFUL"
}

function getMonnifyResponseBody(source: Record<string, unknown> | null | undefined) {
  if (!source || typeof source !== "object") return null
  const nestedData = source && typeof source.data === "object" && source.data !== null
    ? (source.data as Record<string, unknown>)
    : null

  if (source.responseBody && typeof source.responseBody === "object") {
    return source.responseBody as Record<string, unknown>
  }

  if (nestedData && (nestedData.paymentStatus || nestedData.status)) {
    return nestedData
  }

  return source
}

function getIntrinsicMonnifyReferences(source: Record<string, unknown> | null | undefined) {
  if (!source || typeof source !== "object") return []

  const nestedData = source && typeof source.data === "object" && source.data !== null
    ? (source.data as Record<string, unknown>)
    : null
  const responseBody = getMonnifyResponseBody(source)
  const responseBodyData = responseBody && typeof responseBody.data === "object" && responseBody.data !== null
    ? (responseBody.data as Record<string, unknown>)
    : null

  return [...new Set([
    source.transactionReference,
    source.reference,
    source.paymentReference,
    responseBody?.transactionReference,
    responseBody?.reference,
    responseBody?.paymentReference,
    responseBodyData?.transactionReference,
    responseBodyData?.reference,
    responseBodyData?.paymentReference,
    nestedData?.transactionReference,
    nestedData?.reference,
    nestedData?.paymentReference,
  ].map((value) => typeof value === "string" ? value.trim() : "").filter(Boolean))]
}

export function isMonnifyImmediateSuccessResponse(source: Record<string, unknown> | null | undefined) {
  const responseBody = getMonnifyResponseBody(source)
  const paymentStatus = String(responseBody?.paymentStatus || responseBody?.status || source?.paymentStatus || source?.status || "").toUpperCase()
  return isConfirmedPaymentStatus(paymentStatus) && getIntrinsicMonnifyReferences(source).length > 0
}

export async function confirmMonnifyPaymentWithRetries(
  reference: string,
  initialReferences: string[] = [],
  retryDelaysMs: number[] = DEFAULT_RETRY_DELAYS_MS,
): Promise<ConfirmationResult> {
  const knownReferences = [...new Set([reference, ...initialReferences].map((value) => String(value || "").trim()).filter(Boolean))]
  let lastStatus: string | null = null
  let lastVerificationResult: Record<string, unknown> | null = null

  for (const delayMs of retryDelaysMs) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }

    for (const candidateReference of [...knownReferences]) {
      try {
        const verificationResult = await verifyTransaction(candidateReference)
        lastVerificationResult = verificationResult as Record<string, unknown>
        const responseBody = verificationResult?.responseBody as Record<string, unknown> | undefined
        const paymentStatus = String(responseBody?.paymentStatus || responseBody?.status || "").toUpperCase()
        if (paymentStatus) {
          lastStatus = paymentStatus
        }

        const verificationReferences = extractMonnifyReferenceCandidates(candidateReference, responseBody)
        for (const verificationReference of verificationReferences) {
          if (!knownReferences.includes(verificationReference)) {
            knownReferences.push(verificationReference)
          }
        }

        if (verificationResult?.requestSuccessful && isConfirmedPaymentStatus(paymentStatus)) {
          return {
            confirmed: true,
            references: knownReferences,
            paymentStatus,
            verificationResult: verificationResult as Record<string, unknown>,
          }
        }
      } catch {
        // Keep trying within the confirmation window.
      }
    }
  }

  return {
    confirmed: false,
    references: knownReferences,
    paymentStatus: lastStatus,
    verificationResult: lastVerificationResult,
  }
}
