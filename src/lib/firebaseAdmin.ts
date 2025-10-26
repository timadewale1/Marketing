// Lazily initialize firebase-admin to avoid bundling server-only modules into client bundles.
export async function initFirebaseAdmin() {
  try {
    const admin = await import('firebase-admin')
    const fs = await import('fs')
    const path = await import('path')

    let dbAdmin: import('firebase-admin').firestore.Firestore | null = null

    // Try to find a service account file in the project root
    const root = process.cwd()
    const candidates = ['serviceAccountKey.json', 'serviceAccountKey.json.json', 'serviceAccountKey.json.txt']
    const found = candidates.map((c) => path.join(root, c)).find((p: string) => fs.existsSync(p))

    if (found) {
      const raw = fs.readFileSync(found, 'utf8')
      const serviceAccount = JSON.parse(raw)
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount as import('firebase-admin').ServiceAccount),
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
            credential: admin.credential.cert(serviceAccount as import('firebase-admin').ServiceAccount),
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
      if (!admin.apps.length) admin.initializeApp()
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
