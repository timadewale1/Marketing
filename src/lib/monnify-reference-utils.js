function isDuplicateMonnifyReferenceError(error) {
  const text = String(error?.message || error?.toString?.() || '')
  return /supplied reference already exists|responseCode\s*[:=]\s*['"]?D05['"]?/i.test(text)
}

function buildMonnifyReference(baseReference, attempt = 1) {
  const safeBase = String(baseReference || 'withdrawal').trim() || 'withdrawal'
  if (attempt <= 1) return safeBase
  return `${safeBase}-${Date.now()}-${attempt}`
}

module.exports = {
  isDuplicateMonnifyReferenceError,
  buildMonnifyReference,
}
