import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app'
import * as firestoreModule from 'firebase-admin/firestore'
import {
  getFirestore,
  type Firestore as AdminFirestore,
} from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import type { FirebaseAdminCompat, FirebaseAuthCompat, FirestoreCompat, FirebaseUserCompat } from '@/lib/firebase-admin-compat'
import { verifyFirebaseIdToken, verifyFirebaseSessionCookie } from '@/lib/firebase-auth-verifier'

export type FirebaseAdminInitResult = {
  admin: FirebaseAdminCompat | null
  dbAdmin: AdminFirestore | null
}

type ServiceAccount = {
  project_id?: string
  client_email?: string
  private_key?: string
  [key: string]: unknown
}

let cachedResult: FirebaseAdminInitResult | null = null

function normalizePrivateKey(value?: string) {
  return String(value || '').replace(/\\n/g, '\n').trim()
}

function normalizeServiceAccount(value: ServiceAccount) {
  return {
    ...value,
    private_key: normalizePrivateKey(value.private_key),
  }
}

function parseServiceAccount(raw: string): ServiceAccount | null {
  try {
    const parsed = JSON.parse(raw) as ServiceAccount
    if (!parsed || typeof parsed !== 'object') return null
    return normalizeServiceAccount(parsed)
  } catch (error) {
    console.warn('[Firebase] Failed to parse service account JSON:', error)
    return null
  }
}

function createFirestoreCompat(app: App): FirestoreCompat {
  const firestore = (() => getFirestore(app)) as FirestoreCompat
  Object.assign(firestore, firestoreModule)
  return firestore
}

async function loadNativeAuthModule() {
  return import('firebase-admin/auth')
}

function createAuthCompat(app: App): FirebaseAuthCompat {
  let nativeAuthPromise: Promise<{
    getUserByEmail: (email: string) => Promise<FirebaseUserCompat>
    createUser: (properties: Record<string, unknown>) => Promise<FirebaseUserCompat>
    generateEmailVerificationLink: (email: string, actionCodeSettings?: Record<string, unknown>) => Promise<string>
    deleteUser: (uid: string) => Promise<void>
    getUser: (uid: string) => Promise<FirebaseUserCompat>
    generatePasswordResetLink: (email: string, actionCodeSettings?: Record<string, unknown>) => Promise<string>
    createSessionCookie: (idToken: string, options: { expiresIn: number }) => Promise<string>
    createCustomToken: (uid: string, developerClaims?: Record<string, unknown>) => Promise<string>
  }> | null = null

  const getNativeAuth = () => {
    if (!nativeAuthPromise) {
      nativeAuthPromise = loadNativeAuthModule().then((module) => module.getAuth(app) as never)
    }
    return nativeAuthPromise
  }

  return {
    verifyIdToken: async (token: string) => verifyFirebaseIdToken(token) as never,
    verifySessionCookie: async (cookie: string) => verifyFirebaseSessionCookie(cookie) as never,
    createSessionCookie: async (idToken: string, options: { expiresIn: number }) => {
      const nativeAuth = await getNativeAuth()
      return nativeAuth.createSessionCookie(idToken, options)
    },
    getUserByEmail: async (email: string) => {
      const nativeAuth = await getNativeAuth()
      return nativeAuth.getUserByEmail(email)
    },
    createUser: async (properties: Record<string, unknown>) => {
      const nativeAuth = await getNativeAuth()
      return nativeAuth.createUser(properties)
    },
    generateEmailVerificationLink: async (email: string, actionCodeSettings?: Record<string, unknown>) => {
      const nativeAuth = await getNativeAuth()
      return nativeAuth.generateEmailVerificationLink(email, actionCodeSettings)
    },
    deleteUser: async (uid: string) => {
      const nativeAuth = await getNativeAuth()
      await nativeAuth.deleteUser(uid)
    },
    getUser: async (uid: string) => {
      const nativeAuth = await getNativeAuth()
      return nativeAuth.getUser(uid)
    },
    generatePasswordResetLink: async (email: string, actionCodeSettings?: Record<string, unknown>) => {
      const nativeAuth = await getNativeAuth()
      return nativeAuth.generatePasswordResetLink(email, actionCodeSettings)
    },
    createCustomToken: async (uid: string, developerClaims?: Record<string, unknown>) => {
      const nativeAuth = await getNativeAuth()
      return nativeAuth.createCustomToken(uid, developerClaims)
    },
  }
}

function createAdminCompat(app: App): FirebaseAdminCompat {
  const firestore = createFirestoreCompat(app)
  const authCompat = createAuthCompat(app)
  return {
    app: (name?: string) => {
      if (!name) return app
      return getApp(name)
    },
    auth: () => authCompat,
    firestore,
    storage: () => ({
      bucket: (name?: string) => getStorage(app).bucket(name),
    }),
  }
}

function initializeFromCredential(serviceAccount: ServiceAccount, storageBucket?: string) {
  const app = initializeApp({
    credential: cert(serviceAccount as Parameters<typeof cert>[0]),
    storageBucket,
  })
  return app
}

function initializeDefault(storageBucket?: string) {
  return initializeApp({ storageBucket })
}

export async function initFirebaseAdmin(): Promise<FirebaseAdminInitResult> {
  if (cachedResult) {
    return cachedResult
  }

  try {
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    const existingApps = getApps()
    console.log(`[Firebase] Existing apps: ${existingApps.length}`)

    let app: App | null = existingApps[0] || null

    if (!app) {
      const root = process.cwd()
      const candidates = ['serviceAccountKey.json', 'serviceAccountKey.json.json', 'serviceAccountKey.json.txt']
      const found = candidates.map((candidate) => path.join(root, candidate)).find((candidate) => existsSync(candidate))

      if (found) {
        try {
          console.log(`[Firebase] Found service account file: ${found}`)
          const parsed = parseServiceAccount(readFileSync(found, 'utf8'))
          if (parsed) {
            app = initializeFromCredential(parsed, storageBucket)
            console.log('[Firebase] Initialized with credential from file')
          } else {
            console.warn('[Firebase] Service account file parsed to null')
          }
        } catch (error) {
          console.warn('[Firebase] Error initializing from service account file:', error)
        }
      }
    }

    if (!app) {
      const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT
      if (serviceAccountEnv) {
        console.log('[Firebase] Attempting to parse service account from environment')
        const parsed = parseServiceAccount(serviceAccountEnv)
        if (parsed) {
          try {
            app = initializeFromCredential(parsed, storageBucket)
            console.log('[Firebase] Initialized with credential from environment')
          } catch (error) {
            console.warn('[Firebase] Failed to initialize with parsed environment credential:', error)
          }
        }
      }
    }

    if (!app) {
      try {
        console.log('[Firebase] Fallback: attempting default initialization')
        app = initializeDefault(storageBucket)
        console.log('[Firebase] App initialized with default credential')
      } catch (error) {
        console.error('[Firebase] Failed to initialize with default credential:', error)
      }
    }

    if (!app) {
      console.error('[Firebase] Could not initialize Firebase app')
      cachedResult = { admin: null, dbAdmin: null }
      return cachedResult
    }

    const admin = createAdminCompat(app)
    const dbAdmin = getFirestore(app)
    console.log('[Firebase] Firestore initialized successfully')

    cachedResult = { admin, dbAdmin }
    return cachedResult
  } catch (error) {
    console.error('[Firebase] Initialization failed at top level:', error)
    cachedResult = { admin: null, dbAdmin: null }
    return cachedResult
  }
}
