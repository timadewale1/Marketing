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
    let admin = adminModule as unknown as FirebaseAdminCompat
    
    // Handle both default and named exports
    if ('default' in adminModule && adminModule.default) {
      admin = (adminModule.default as unknown) as FirebaseAdminCompat
    }
    
    // Verify admin exists
    if (!admin) {
      console.error('Failed to import firebase-admin module')
      return { admin: null, dbAdmin: null }
    }

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
        
        // Try to initialize with credential
        try {
          if (adminApi.credential && typeof adminApi.credential.cert === 'function') {
            const certCredential = adminApi.credential.cert(serviceAccount)
            if (certCredential && (adminApi.getApps?.() || []).length === 0) {
              adminApi.initializeApp?.({
                credential: certCredential,
                storageBucket,
              })
            }
          }
        } catch (credErr) {
          console.warn('Could not use credential.cert() from file:', credErr)
        }

        // Try to get firestore instance
        try {
          if (typeof admin.firestore === 'function') {
            dbAdmin = admin.firestore()
            return { admin, dbAdmin }
          }
        } catch (err) {
          console.warn('Could not get firestore from initialized app (file):', err)
        }
      } catch (err) {
        console.error('Error loading service account from file:', err)
      }
    }

    // Check for service account in environment variables (Vercel)
    const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountEnv) {
      try {
        const serviceAccount = JSON.parse(serviceAccountEnv);
        
        // Try to initialize with credential
        try {
          if (adminApi.credential && typeof adminApi.credential.cert === 'function') {
            const certCredential = adminApi.credential.cert(serviceAccount)
            if (certCredential && (adminApi.getApps?.() || []).length === 0) {
              adminApi.initializeApp?.({
                credential: certCredential,
                storageBucket,
              })
            }
          }
        } catch (credErr) {
          console.warn('Could not use credential.cert() from env var:', credErr)
        }

        // Try to get firestore instance
        try {
          if (typeof admin.firestore === 'function') {
            dbAdmin = admin.firestore()
            console.log('Firebase initialized with credentials from env var')
            return { admin, dbAdmin }
          }
        } catch (err) {
          console.warn('Could not get firestore from initialized app (env var):', err)
        }
      } catch (err) {
        console.error('Error parsing service account from environment:', err)
      }
    }

    // Last fallback: Try to initialize app without explicit credential
    try {
      // Initialize if not already initialized
      if ((adminApi.getApps?.() || []).length === 0) {
        adminApi.initializeApp?.({ storageBucket })
      }
      
      // Try to get firestore instance
      if (typeof admin.firestore === 'function') {
        dbAdmin = admin.firestore()
        console.log('Firebase initialized with default credentials')
        return { admin, dbAdmin }
      } else {
        console.error('admin.firestore is not a function after initialization')
      }
    } catch (err) {
      console.error('Failed to initialize Firebase with default method:', err)
    }

    // no admin credentials available
    return { admin: null, dbAdmin: null }
  } catch (e) {
    console.warn('firebase-admin initialization failed (lazy); falling back to client SDK', e)
    return { admin: null, dbAdmin: null }
  }
}
