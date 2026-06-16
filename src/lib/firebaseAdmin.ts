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
      console.error('[Firebase] Failed to import firebase-admin module')
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

    // Check if app is already initialized
    const existingApps = adminApi.getApps?.() || []
    console.log(`[Firebase] Existing apps: ${existingApps.length}`)

    if (existingApps.length > 0) {
      try {
        console.log('[Firebase] Using existing app instance')
        // Try to get firestore from the first app directly
        const app = existingApps[0]
        dbAdmin = app.firestore?.() || adminApi.firestore?.()
        if (dbAdmin) {
          console.log('[Firebase] Retrieved firestore from existing app')
          return { admin, dbAdmin }
        }
        console.warn('[Firebase] Existing app but firestore unavailable')
      } catch (err) {
        console.warn('[Firebase] Error getting firestore from existing app:', err)
      }
    }

    let appInitialized = false

    // Try to find a service account file in the project root
    const root = process.cwd()
    const candidates = ['serviceAccountKey.json', 'serviceAccountKey.json.json', 'serviceAccountKey.json.txt']
    const found = candidates.map((c) => path.join(root, c)).find((p: string) => fs.existsSync(p))

    if (found) {
      try {
        console.log(`[Firebase] Found service account file: ${found}`)
        const raw = fs.readFileSync(found, 'utf8')
        const serviceAccount = JSON.parse(raw)

        try {
          // Try to initialize with credential from file
          const certCredential = adminApi.credential?.cert(serviceAccount)
          if (certCredential) {
            adminApi.initializeApp?.({ credential: certCredential, storageBucket })
            appInitialized = true
            console.log('[Firebase] Initialized with credential from file')
          } else {
            console.warn('[Firebase] Failed to create cert credential from file')
          }
        } catch (certErr) {
          console.warn('[Firebase] Error with credential from file:', certErr)
        }
      } catch (err) {
        console.warn('[Firebase] Error loading service account from file:', err)
      }
    }

    // Try environment variables (Vercel)
    if (!appInitialized) {
      const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT
      if (serviceAccountEnv) {
        try {
          console.log('[Firebase] Attempting to parse service account from environment')
          const serviceAccount = JSON.parse(serviceAccountEnv)

          try {
            // Try to initialize with credential from environment
            const certCredential = adminApi.credential?.cert(serviceAccount)
            if (certCredential) {
              adminApi.initializeApp?.({ credential: certCredential, storageBucket })
              appInitialized = true
              console.log('[Firebase] Initialized with credential from environment')
            } else {
              console.warn('[Firebase] Failed to create cert credential from environment')
            }
          } catch (certErr) {
            console.warn('[Firebase] Error with credential from environment:', certErr)
          }
        } catch (err) {
          console.warn('[Firebase] Error parsing service account from environment:', err)
        }
      }
    }

    // Last fallback: Initialize without explicit credential
    if (!appInitialized && (adminApi.getApps?.() || []).length === 0) {
      try {
        console.log('[Firebase] Fallback: attempting default initialization')
        adminApi.initializeApp?.({ storageBucket })
        appInitialized = true
        console.log('[Firebase] App initialized with default credential')
      } catch (err) {
        console.error('[Firebase] Failed to initialize with default credential:', err)
      }
    }

    // Now attempt to get firestore instance
    try {
      console.log('[Firebase] Attempting to get firestore instance after initialization')
      const appsAfterInit = (adminApi.getApps?.() || []).length
      console.log(`[Firebase] Apps available: ${appsAfterInit}`)
      
      dbAdmin = adminApi.firestore?.()
      if (dbAdmin) {
        console.log('[Firebase] Successfully retrieved firestore instance')
        return { admin, dbAdmin }
      } else {
        console.error('[Firebase] firestore() returned null/undefined after init')
        // Try one more time through app instance
        const apps = adminApi.getApps?.() || []
        if (apps.length > 0) {
          console.log('[Firebase] Trying to get firestore from app instance directly')
          dbAdmin = apps[0].firestore?.()
          if (dbAdmin) {
            console.log('[Firebase] Successfully retrieved firestore from app instance')
            return { admin, dbAdmin }
          }
        }
      }
    } catch (err) {
      console.error('[Firebase] Error retrieving firestore instance:', err)
    }

    // No successful initialization
    console.error('[Firebase] Could not initialize Firebase or get firestore instance after all attempts')
    return { admin: null, dbAdmin: null }
  } catch (e) {
    console.error('[Firebase] Initialization failed at top level:', e)
    return { admin: null, dbAdmin: null }
  }
}
