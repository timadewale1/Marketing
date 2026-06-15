import type { Bucket } from '@google-cloud/storage'
import type { App } from 'firebase-admin/app'

type FirestoreNamespace = typeof import('firebase-admin/firestore')

type FirestoreCompat = FirestoreNamespace & {
  (): InstanceType<FirestoreNamespace['Firestore']>
}

export type FirebaseAdminCompat = typeof import('firebase-admin') & {
  app: (name?: string) => App
  auth: () => import('firebase-admin/auth').Auth
  firestore: FirestoreCompat
  storage: () => { bucket: (name?: string) => Bucket }
}
