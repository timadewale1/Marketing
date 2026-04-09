export function getProofUrls(
  source: { proofUrl?: unknown; proofUrls?: unknown } | null | undefined
) {
  const urls = Array.isArray(source?.proofUrls)
    ? source.proofUrls
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .slice(0, 5)
    : []

  if (urls.length > 0) {
    return urls
  }

  const single = String(source?.proofUrl || "").trim()
  return single ? [single] : []
}
