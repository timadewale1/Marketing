export function normalizeExternalLink(input: string | null | undefined) {
  const raw = String(input || '').trim()
  if (!raw) return ''

  if (/^(https?:)?\/\//i.test(raw)) {
    return raw.startsWith('//') ? `https:${raw}` : raw
  }

  return `https://${raw.replace(/^\/+/, '')}`
}

export function isExternalHref(value: string | null | undefined) {
  return /^https?:\/\//i.test(String(value || '').trim()) || String(value || '').trim().startsWith('//')
}
