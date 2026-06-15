import type { Firestore as AdminFirestore } from 'firebase-admin/firestore'
import type { FirebaseAdminCompat } from '@/lib/firebase-admin-compat'

export type FirebaseAdminInitResult = {
  admin: FirebaseAdminCompat | null
  dbAdmin: AdminFirestore | null
}

// Lazily initialize firebase-admin to avoid bundling server-only modules into client bundles.
export async function initFirebaseAdmin(): Promise<FirebaseAdminInitResult> {
  try {
    // Import firebase-admin
    const adminModule = await import('firebase-admin')
    const adminRaw = adminModule.default || adminModule

    if (!adminRaw) {
      console.error('Failed to import firebase-admin module')
      return { admin: null, dbAdmin: null }
    }

    const admin = adminRaw as FirebaseAdminCompat
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminApi = adminRaw as any

    const fs = await import('fs')
    const path = await import('path')
    const storageBucket =
      process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET

    let dbAdmin: AdminFirestore | null = null
    let app: any = null

    // Check if app is already initialized
    const existingApps = adminApi.getApps?.() || []
    if (existingApps.length > 0) {
      app = existingApps[0]
      console.log('Using existing Firebase app')
    }

    // Try to find a service account file in the project root
    if (!app) {
      const root = process.cwd()
      const candidates = ['serviceAccountKey.json', 'serviceAccountKey.json.json', 'serviceAccountKey.json.txt']
      const found = candidates.map((c) => path.join(root, c)).find((p: string) => fs.existsSync(p))

      if (found) {
        try {
          const raw = fs.readFileSync(found, 'utf8')
          const serviceAccount = JSON.parse(raw)

          if (adminApi.credential && typeof adminApi.credential.cert === 'function') {
            try {
              const certCredential = adminApi.credential.cert(serviceAccount)
              app = adminApi.initializeApp?.({
                credential: certCredential,
                storageBucket,
              })
              console.log('Firebase initialized with credential from file')
            } catch (certErr) {
              console.warn('Failed to initialize with credential from file:', certErr)
            }
          }
        } catch (err) {
          console.error('Error loading service account from file:', err)
        }
      }
    }

    // Try environment variables (Vercel)
    if (!app) {
      const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT
      if (serviceAccountEnv) {
        try {
          const serviceAccount = JSON.parse(serviceAccountEnv)

          if (adminApi.credential && typeof adminApi.credential.cert === 'function') {
            try {
              const certCredential = adminApi.credential.cert(serviceAccount)
              app = adminApi.initializeApp?.({
                credential: certCredential,
                storageBucket,
              })
              console.log('Firebase initialized with credential from environment')
            } catch (certErr) {
              console.warn('Failed to initialize with credential from env:', certErr)
            }
          }
        } catch (err) {
          console.error('Error parsing service account from environment:', err)
        }
      }
    }

    // Last fallback: Initialize without explicit credential (uses application defaults)
    if (!app) {
      try {
        app = adminApi.initializeApp?.({ storageBucket })
        console.log('Firebase initialized with default credentials')
      } catch (err) {
        console.warn('Failed to initialize app with defaults:', err)
      }
    }

    // Now try to get firestore instance from the initialized app
    if (app) {
      try {
        // Try to get firestore from the app instance
        if (typeof app.firestore === 'function') {
          dbAdmin = app.firestore()
          console.log('Got firestore instance from app')
          return { admin, dbAdmin }
        }
      } catch (err) {
        console.warn('Failed to get firestore from app instance:', err)
      }

      try {
        // Fallback: try admin.firestore()
        if (typeof adminApi.firestore === 'function') {
          dbAdmin = adminApi.firestore()
          console.log('Got firestore instance from admin')
          return { admin, dbAdmin }
        }
      } catch (err) {
        console.error('Failed to get firestore from admin:', err)
      }
    }

    // No successful initialization
    return { admin: null, dbAdmin: null }
  } catch (e) {
    console.error('firebase-admin initialization failed (lazy):', e)
    return { admin: null, dbAdmin: null }
  }
}
