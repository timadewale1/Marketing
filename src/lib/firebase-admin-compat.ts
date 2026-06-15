import type { Bucket } from '@google-cloud/storage'

type FirestoreNamespace = typeof import('firebase-admin/firestore')

type FirestoreCompat = FirestoreNamespace & {
  (): FirestoreNamespace['Firestore']
}

export type FirebaseAdminCompat = typeof import('firebase-admin') & {
  auth: () => import('firebase-admin/auth').Auth
  firestore: FirestoreCompat
  storage: () => { bucket: (name?: string) => Bucket }
}
