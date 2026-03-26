const PRIMARY_ADMIN_EMAIL = 'pambaadverts@gmail.com'
const PRIMARY_ADMIN_AUTH_ALIAS = 'pambaadverts+admin@gmail.com'

export function normalizeAdminLoginEmail(email: string) {
  const normalized = email.trim().toLowerCase()
  if (normalized === PRIMARY_ADMIN_EMAIL) {
    return PRIMARY_ADMIN_AUTH_ALIAS
  }
  return normalized
}

export function getAdminDisplayEmail(email?: string | null) {
  const normalized = String(email || '').trim().toLowerCase()
  if (normalized === PRIMARY_ADMIN_AUTH_ALIAS) {
    return PRIMARY_ADMIN_EMAIL
  }
  return normalized
}
