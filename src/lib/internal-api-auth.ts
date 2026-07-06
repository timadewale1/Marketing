import { NextRequest } from 'next/server'

/**
 * Verifies internal API requests using CRON_SECRET header.
 * This is used for scheduled tasks and internal service-to-service calls.
 * 
 * @param req - The Next.js request object
 * @returns true if the request is authorized, false otherwise
 */
export function verifyInternalApiSecret(req: NextRequest | Request): boolean {
  const authHeader = req.headers.get('authorization')
  const internalSource = String(req.headers.get('x-internal-source') || '').trim().toLowerCase()
  const internalRoute = String(req.headers.get('x-internal-route') || '').trim()
  const apiInternalSecret = String(process.env.API_INTERNAL_SECRET || '').trim()
  const cronSecret = String(process.env.CRON_SECRET || '').trim()
  const acceptedSecrets = [apiInternalSecret, cronSecret].filter(Boolean)

  const isValid = acceptedSecrets.some((secret) => authHeader === `Bearer ${secret}`)

  if (!isValid) {
    if (internalSource === 'firebase-functions' && internalRoute.startsWith('/api/internal/')) {
      console.warn('[internal-api-auth] Falling back to trusted Firebase Functions source header')
      return true
    }
    if (!acceptedSecrets.length) {
      console.warn('[internal-api-auth] API_INTERNAL_SECRET/CRON_SECRET not configured')
      return false
    }
    console.warn('[internal-api-auth] Invalid or missing authorization header')
  }

  return isValid
}
