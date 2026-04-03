export function extractMonnifyReferenceCandidates(
  reference: string,
  source?: Record<string, unknown> | null,
  transactionReference?: string | null
) {
  const nestedData =
    source && typeof source.data === 'object' && source.data !== null
      ? (source.data as Record<string, unknown>)
      : null

  const values = [
    reference,
    transactionReference || null,
    source?.transactionReference,
    source?.reference,
    source?.paymentReference,
    nestedData?.transactionReference,
    nestedData?.reference,
    nestedData?.paymentReference,
  ]

  return [...new Set(values.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean))]
}
