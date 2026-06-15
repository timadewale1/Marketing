import type { Firestore as AdminFirestore } from 'firebase-admin/firestore'
import type { FirebaseAdminCompat } from '@/lib/firebase-admin-compat'

export type FirebaseAdminInitResult = {
  admin: FirebaseAdminCompat | null
  dbAdmin: AdminFirestore | null
}

// Lazily initialize firebase-admin to avoid bundling server-only modules into client bundles.
export async function initFirebaseAdmin(): Promise<FirebaseAdminInitResult> {
  try {
    const adminModule = await import('firebase-admin')
    const admin = ((adminModule as { default?: unknown }).default || adminModule) as FirebaseAdminCompat
    const adminApi = admin as unknown as {
      getApps?: () => unknown[]
      initializeApp?: (options?: Record<string, unknown>) => unknown
      credential?: { cert: (serviceAccount: Record<string, unknown>) => unknown }
    }
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
        
        // Validate credential module exists
        if (!adminApi.credential || typeof adminApi.credential.cert !== 'function') {
          console.warn('Firebase-admin credential module not available from file')
          // Fall through to environment variable
        } else {
          const certCredential = adminApi.credential.cert(serviceAccount)
          if ((adminApi.getApps?.() || []).length === 0) {
            adminApi.initializeApp?.({
              credential: certCredential,
              storageBucket,
            })
          }
          dbAdmin = admin.firestore()
          return { admin, dbAdmin }
        }
      } catch (err) {
        console.error('Error loading service account from file:', err)
        // Fall through to environment variable
      }
    }

    // Check for service account in environment variables (Vercel)
    const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountEnv) {
      try {
        const serviceAccount = JSON.parse(serviceAccountEnv);
        
        // Try to initialize with credential from service account
        try {
          if (adminApi.credential && typeof adminApi.credential.cert === 'function') {
            const certCredential = adminApi.credential.cert(serviceAccount)
            if (certCredential && (adminApi.getApps?.() || []).length === 0) {
              adminApi.initializeApp?.({
                credential: certCredential,
                storageBucket,
              })
              dbAdmin = admin.firestore()
              return { admin, dbAdmin }
            }
          }
        } catch (credErr) {
          console.warn('Could not use credential.cert(), will try without explicit credential:', credErr)
        }

        // If credential.cert didn't work, try initializing without it (will use application default)
        try {
          if ((adminApi.getApps?.() || []).length === 0) {
            adminApi.initializeApp?.({ storageBucket })
          }
          dbAdmin = admin.firestore()
          console.log('Firebase initialized from FIREBASE_SERVICE_ACCOUNT_KEY env with default credentials')
          return { admin, dbAdmin }
        } catch (err) {
          console.warn('Could not initialize with application default:', err)
        }
      } catch (err) {
        console.error('Error parsing service account from environment:', err)
      }
    }

    // Fallback: Try to initialize with just storageBucket (will use any available default credentials)
    try {
      if ((adminApi.getApps?.() || []).length === 0) {
        adminApi.initializeApp?.({ storageBucket })
      }
      dbAdmin = admin.firestore()
      console.log('Firebase initialized with default credentials')
      return { admin, dbAdmin }
    } catch (err) {
      console.error('Failed to initialize Firebase with any method:', err)
    }

    // no admin credentials available
    return { admin: null, dbAdmin: null }
  } catch (e) {
    console.warn('firebase-admin initialization failed (lazy); falling back to client SDK', e)
    return { admin: null, dbAdmin: null }
  }
}
