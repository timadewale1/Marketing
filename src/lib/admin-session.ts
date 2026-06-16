import { cookies } from 'next/headers'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { getAdminDisplayEmail } from '@/lib/admin-auth'

const ADMIN_COOKIE_NAME = 'adminSession'
const ADMIN_SESSION_EXPIRES_MS = 5 * 24 * 60 * 60 * 1000

export async function createAdminSessionCookie(idToken: string) {
  console.log('[AdminSession] Creating session cookie...')
  const result = await initFirebaseAdmin()
  console.log(`[AdminSession] Init result: admin=${!!result.admin}, dbAdmin=${!!result.dbAdmin}`)
  if (!result.admin || !result.dbAdmin) {
    console.error('[AdminSession] Firebase initialization failed in createAdminSessionCookie')
    throw new Error('Firebase admin unavailable')
  }

  const decoded = await result.admin.auth().verifyIdToken(idToken)
  const adminDoc = await result.dbAdmin.collection('admins').doc(decoded.uid).get()
  if (!adminDoc.exists) {
    throw new Error('User is not authorized as admin')
  }

  const sessionCookie = await result.admin.auth().createSessionCookie(idToken, {
    expiresIn: ADMIN_SESSION_EXPIRES_MS,
  })

  return {
    sessionCookie,
    uid: decoded.uid,
    email: String(adminDoc.data()?.loginEmail || getAdminDisplayEmail(decoded.email || adminDoc.data()?.email || '')),
  }
}

export async function clearAdminSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.set({
    name: ADMIN_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export async function setAdminSessionCookie(sessionCookie: string) {
  const cookieStore = await cookies()
  cookieStore.set({
    name: ADMIN_COOKIE_NAME,
    value: sessionCookie,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSION_EXPIRES_MS / 1000,
  })
}

export async function requireAdminSession() {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!sessionCookie) {
    console.warn('[AdminSession] No session cookie found')
    throw new Error('Unauthorized')
  }

  console.log('[AdminSession] Initializing Firebase for session validation...')
  const result = await initFirebaseAdmin()
  console.log(`[AdminSession] Init result: admin=${!!result.admin}, dbAdmin=${!!result.dbAdmin}`)
  if (!result.admin || !result.dbAdmin) {
    console.error('[AdminSession] Firebase initialization failed in requireAdminSession')
    throw new Error('Firebase admin unavailable')
  }

  const decoded = await result.admin.auth().verifySessionCookie(sessionCookie, true)
  const adminDoc = await result.dbAdmin.collection('admins').doc(decoded.uid).get()
  if (!adminDoc.exists) {
    console.warn(`[AdminSession] Admin doc not found for UID: ${decoded.uid}`)
    throw new Error('Unauthorized')
  }

  console.log(`[AdminSession] Session validated for UID: ${decoded.uid}`)
  return {
    uid: decoded.uid,
    email: String(adminDoc.data()?.loginEmail || getAdminDisplayEmail(decoded.email || adminDoc.data()?.email || '')),
  }
}
