import type { Bucket } from '@google-cloud/storage'

export type FirebaseAdminCompat = typeof import('firebase-admin') & {
  storage: () => { bucket: (name?: string) => Bucket }
}
