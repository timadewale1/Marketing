function normalizeUrlList(
  listValue: unknown,
  singleValue: unknown
) {
  const urls = Array.isArray(listValue)
    ? listValue
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .slice(0, 5)
    : []

  if (urls.length > 0) {
    return urls
  }

  const single = String(singleValue || "").trim()
  return single ? [single] : []
}

export function getProofUrls(
  source: { proofUrl?: unknown; proofUrls?: unknown } | null | undefined
) {
  return normalizeUrlList(source?.proofUrls, source?.proofUrl)
}

export function getCampaignProofSampleUrls(
  source:
    | { participationProofSampleUrl?: unknown; participationProofSampleUrls?: unknown }
    | null
    | undefined
) {
  return normalizeUrlList(
    source?.participationProofSampleUrls,
    source?.participationProofSampleUrl
  )
}
