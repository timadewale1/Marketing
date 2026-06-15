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
          console.warn('Firebase-admin credential module not available')
          // Fall through to other methods
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
        
        // Validate the parsed service account object
        if (!serviceAccount || typeof serviceAccount !== 'object') {
          throw new Error('Service account is not a valid object')
        }
        
        if (!serviceAccount.private_key || !serviceAccount.client_email) {
          throw new Error('Service account missing required fields: private_key or client_email')
        }
        
        // Validate credential module exists and can create cert
        if (!adminApi.credential || typeof adminApi.credential.cert !== 'function') {
          console.warn('Firebase-admin credential module not available')
          // Fall through to GOOGLE_APPLICATION_CREDENTIALS
        } else {
          const certCredential = adminApi.credential.cert(serviceAccount)
          if (!certCredential) {
            throw new Error('Failed to create credential from service account')
          }
          
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
        console.error('Error parsing service account from environment:', err)
        // Fall through to GOOGLE_APPLICATION_CREDENTIALS
      }
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        if ((adminApi.getApps?.() || []).length === 0) {
          adminApi.initializeApp?.({ storageBucket })
        }
        dbAdmin = admin.firestore()
        return { admin, dbAdmin }
      } catch (err) {
        console.error('Error initializing Firebase with GOOGLE_APPLICATION_CREDENTIALS:', err)
      }
    }

    // no admin credentials available
    return { admin: null, dbAdmin: null }
  } catch (e) {
  console.warn('firebase-admin initialization failed (lazy); falling back to client SDK', e)
    return { admin: null, dbAdmin: null }
  }
}
