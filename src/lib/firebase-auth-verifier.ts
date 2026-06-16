import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import type { DecodedIdToken } from 'firebase-admin/auth'

const jwksByProject = new Map<string, ReturnType<typeof createRemoteJWKSet>>()
const FIREBASE_SECURETOKEN_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

function getProjectId() {
  const raw = (
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    ''
  ).trim()

  // Defensive cleanup for accidentally quoted env values in deployment settings.
  return raw.replace(/^['"]+|['"]+$/g, '')
}

function getJwks() {
  const projectId = getProjectId()
  if (!projectId) {
    throw new Error('Firebase project id is not configured')
  }

  const existing = jwksByProject.get(projectId)
  if (existing) return { projectId, jwks: existing }

  const jwks = createRemoteJWKSet(new URL(FIREBASE_SECURETOKEN_JWKS_URL))
  jwksByProject.set(projectId, jwks)
  return { projectId, jwks }
}

function normalizePayload(payload: JWTPayload): DecodedIdToken {
  const uid = String(payload.sub || (payload as Record<string, unknown>).uid || '')
  return {
    ...payload,
    uid,
    auth_time: Number((payload as Record<string, unknown>).auth_time || 0),
    firebase: (payload as Record<string, unknown>).firebase || {},
    email: typeof payload.email === 'string' ? payload.email : undefined,
  } as DecodedIdToken
}

async function verifyWithIssuer(token: string, issuer: string) {
  const { projectId, jwks } = getJwks()
  const { payload } = await jwtVerify(token, jwks, {
    audience: projectId,
    issuer,
  })
  return normalizePayload(payload)
}

export async function verifyFirebaseIdToken(token: string) {
  const { projectId } = getJwks()
  return verifyWithIssuer(token, `https://securetoken.google.com/${projectId}`)
}

export async function verifyFirebaseSessionCookie(cookie: string) {
  const { projectId } = getJwks()
  return verifyWithIssuer(cookie, `https://session.firebase.google.com/${projectId}`)
}
