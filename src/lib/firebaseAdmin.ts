import type { Firestore as AdminFirestore } from 'firebase-admin/firestore'
import type { FirebaseAdminCompat } from '@/lib/firebase-admin-compat'

export type FirebaseAdminInitResult = {
  admin: FirebaseAdminCompat | null
  dbAdmin: AdminFirestore | null
}

// Lazily initialize firebase-admin to avoid bundling server-only modules into client bundles.
export async function initFirebaseAdmin(): Promise<FirebaseAdminInitResult> {
  try {
    // Import firebase-admin - handle both ESM and CommonJS
    const adminModule = await import('firebase-admin')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminRaw = adminModule.default || adminModule
    const admin = adminRaw as FirebaseAdminCompat
    
    if (!adminRaw) {
      console.error('Failed to import firebase-admin module')
      return { admin: null, dbAdmin: null }
    }
    
    // Cast to any to access firebase-admin runtime methods
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
        
        try {
          // Try to use credential.cert if available, otherwise init without it
          if (adminApi.credential && typeof adminApi.credential.cert === 'function') {
            try {
              const certCredential = adminApi.credential.cert(serviceAccount)
              if ((adminApi.getApps?.() || []).length === 0) {
                adminApi.initializeApp?.({
                  credential: certCredential,
                  storageBucket,
                })
              }
              dbAdmin = adminApi.firestore()
              console.log('Firebase initialized with credential from file')
              return { admin, dbAdmin }
            } catch (certErr) {
              console.warn('credential.cert failed, trying without it:', certErr)
            }
          }
          
          // Try without explicit credential
          if ((adminApi.getApps?.() || []).length === 0) {
            adminApi.initializeApp?.({ storageBucket })
          }
          dbAdmin = adminApi.firestore()
          console.log('Firebase initialized from file with default credentials')
          return { admin, dbAdmin }
        } catch (err) {
          console.warn('Failed to initialize from file:', err)
        }
      } catch (err) {
        console.error('Error loading service account from file:', err)
      }
    }

    // Check for service account in environment variables (Vercel)
    const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT
    if (serviceAccountEnv) {
      try {
        const serviceAccount = JSON.parse(serviceAccountEnv)
        
        try {
          // Try to use credential.cert if available
          if (adminApi.credential && typeof adminApi.credential.cert === 'function') {
            try {
              const certCredential = adminApi.credential.cert(serviceAccount)
              if ((adminApi.getApps?.() || []).length === 0) {
                adminApi.initializeApp?.({
                  credential: certCredential,
                  storageBucket,
                })
              }
              dbAdmin = adminApi.firestore()
              console.log('Firebase initialized with credential from env var')
              return { admin, dbAdmin }
            } catch (certErr) {
              console.warn('credential.cert from env failed, trying without it:', certErr)
            }
          }
          
          // Try without explicit credential
          if ((adminApi.getApps?.() || []).length === 0) {
            adminApi.initializeApp?.({ storageBucket })
          }
          dbAdmin = adminApi.firestore()
          console.log('Firebase initialized from env var with default credentials')
          return { admin, dbAdmin }
        } catch (err) {
          console.warn('Failed to initialize from env var:', err)
        }
      } catch (err) {
        console.error('Error parsing service account from environment:', err)
      }
    }

    // Last fallback: Try to initialize app without any credential
    try {
      if ((adminApi.getApps?.() || []).length === 0) {
        adminApi.initializeApp?.({ storageBucket })
      }
      dbAdmin = adminApi.firestore()
      console.log('Firebase initialized with application default credentials')
      return { admin, dbAdmin }
    } catch (err) {
      console.error('Failed to initialize Firebase:', err)
    }

    // no admin credentials available
    return { admin: null, dbAdmin: null }
  } catch (e) {
    console.warn('firebase-admin initialization failed (lazy); falling back to client SDK', e)
    return { admin: null, dbAdmin: null }
  }
}
