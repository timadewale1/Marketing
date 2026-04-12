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
