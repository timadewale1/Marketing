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

    // Try to find a service account file in the project root
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
            // Only initialize if not already done
            if ((adminApi.getApps?.() || []).length === 0) {
              adminApi.initializeApp?.({
                credential: certCredential,
                storageBucket,
              })
            }
            dbAdmin = adminApi.firestore?.()
            if (dbAdmin) {
              console.log('Firebase initialized with credential from file')
              return { admin, dbAdmin }
            }
          } catch (certErr) {
            console.warn('Failed with credential from file:', certErr)
          }
        }
      } catch (err) {
        console.warn('Error loading service account from file:', err)
      }
    }

    // Try environment variables (Vercel)
    const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT
    if (serviceAccountEnv) {
      try {
        const serviceAccount = JSON.parse(serviceAccountEnv)

        if (adminApi.credential && typeof adminApi.credential.cert === 'function') {
          try {
            const certCredential = adminApi.credential.cert(serviceAccount)
            // Only initialize if not already done
            if ((adminApi.getApps?.() || []).length === 0) {
              adminApi.initializeApp?.({
                credential: certCredential,
                storageBucket,
              })
            }
            dbAdmin = adminApi.firestore?.()
            if (dbAdmin) {
              console.log('Firebase initialized with credential from environment')
              return { admin, dbAdmin }
            }
          } catch (certErr) {
            console.warn('Failed with credential from environment:', certErr)
          }
        }
      } catch (err) {
        console.warn('Error parsing service account from environment:', err)
      }
    }

    // Last fallback: Initialize without explicit credential or use existing app
    try {
      if ((adminApi.getApps?.() || []).length === 0) {
        adminApi.initializeApp?.({ storageBucket })
      }
      dbAdmin = adminApi.firestore?.()
      if (dbAdmin) {
        console.log('Firebase initialized/retrieved successfully')
        return { admin, dbAdmin }
      }
    } catch (err) {
      console.error('Failed to initialize or retrieve Firebase:', err)
    }

    // No successful initialization
    console.error('Could not initialize Firebase or get firestore instance')
    return { admin: null, dbAdmin: null }
  } catch (e) {
    console.error('firebase-admin initialization failed:', e)
    return { admin: null, dbAdmin: null }
  }
}
