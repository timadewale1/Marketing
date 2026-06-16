import type { Bucket } from '@google-cloud/storage'
import type { App } from 'firebase-admin/app'
import type { Auth } from 'firebase-admin/auth'
import type * as FirestoreAdmin from 'firebase-admin/firestore'

export type FirestoreCompat = typeof FirestoreAdmin & (() => FirestoreAdmin.Firestore)

export type FirebaseAdminCompat = typeof import('firebase-admin') & {
  app: (name?: string) => App
  auth: typeof import('firebase-admin/auth') & (() => Auth)
  firestore: FirestoreCompat
  storage: () => { bucket: (name?: string) => Bucket }
}
