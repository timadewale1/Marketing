import type { Bucket } from '@google-cloud/storage'

export type FirebaseAdminCompat = typeof import('firebase-admin') & {
  auth: () => import('firebase-admin/auth').Auth
  storage: () => { bucket: (name?: string) => Bucket }
}
