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
  const cronSecret = process.env.CRON_SECRET

  // If no CRON_SECRET is set in production-like environments, deny access
  if (!cronSecret) {
    console.warn('[internal-api-auth] CRON_SECRET not configured')
    return false
  }

  // Check Bearer token format
  const expectedAuth = `Bearer ${cronSecret}`
  const isValid = authHeader === expectedAuth

  if (!isValid) {
    console.warn('[internal-api-auth] Invalid or missing authorization header')
  }

  return isValid
}
