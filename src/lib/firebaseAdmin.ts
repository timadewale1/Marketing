import type { Firestore as AdminFirestore } from 'firebase-admin/firestore'
import type { Bucket } from '@google-cloud/storage'

export type FirebaseAdminCompat = {
  apps: unknown[]
  initializeApp: (options?: Record<string, unknown>) => unknown
  credential: {
    cert: (serviceAccount: Record<string, unknown>) => unknown
  }
  auth: () => import('firebase-admin/auth').Auth
  firestore: (() => import('firebase-admin/firestore').Firestore) & typeof import('firebase-admin/firestore')
  storage: () => { bucket: (name?: string) => Bucket }
}

export type FirebaseAdminInitResult = {
  admin: FirebaseAdminCompat | null
  dbAdmin: AdminFirestore | null
}

// Lazily initialize firebase-admin to avoid bundling server-only modules into client bundles.
export async function initFirebaseAdmin(): Promise<FirebaseAdminInitResult> {
  try {
    const adminModule = await import('firebase-admin')
    const admin = ((adminModule as { default?: unknown }).default || adminModule) as FirebaseAdminCompat
    const fs = await import('fs')
    const path = await import('path')
    const storageBucket =
      process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET

    let dbAdmin: AdminFirestore | null = null

    // Try to find a service account file in the project root
    const root = process.cwd()
    const candidates = ['serviceAccountKey.json', 'serviceAccountKey.json.json', 'serviceAccountKey.json.txt']
    const found = candidates.map((c) => path.join(root, c)).find((p: string) => fs.existsSync(p))

    if (found) {
      const raw = fs.readFileSync(found, 'utf8')
      const serviceAccount = JSON.parse(raw)
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          storageBucket,
        })
      }
      dbAdmin = admin.firestore()
      return { admin, dbAdmin }
    }

    // Check for service account in environment variables (Vercel)
    const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountEnv) {
      try {
        const serviceAccount = JSON.parse(serviceAccountEnv);
        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket,
          })
        }
        dbAdmin = admin.firestore()
        return { admin, dbAdmin }
      } catch (err) {
        console.error('Error parsing service account from environment:', err)
        return { admin: null, dbAdmin: null }
      }
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      if (!admin.apps.length) admin.initializeApp({ storageBucket })
      dbAdmin = admin.firestore()
      return { admin, dbAdmin }
    }

    // no admin credentials available
    return { admin: null, dbAdmin: null }
  } catch (e) {
  console.warn('firebase-admin initialization failed (lazy); falling back to client SDK', e)
    return { admin: null, dbAdmin: null }
  }
}
