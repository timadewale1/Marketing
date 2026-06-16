import type { Bucket } from '@google-cloud/storage'
import type { App } from 'firebase-admin/app'
import type { Auth } from 'firebase-admin/auth'
import type * as FirestoreAdmin from 'firebase-admin/firestore'
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore'

export type FirestoreCompat = {
  (): AdminFirestore
  FieldValue: typeof FirestoreAdmin.FieldValue
  FieldPath: typeof FirestoreAdmin.FieldPath
  Timestamp: typeof FirestoreAdmin.Timestamp
  GeoPoint: typeof FirestoreAdmin.GeoPoint
  Firestore: typeof FirestoreAdmin.Firestore
  CollectionReference: typeof FirestoreAdmin.CollectionReference
  DocumentReference: typeof FirestoreAdmin.DocumentReference
  Query: typeof FirestoreAdmin.Query
  Transaction: typeof FirestoreAdmin.Transaction
  WriteBatch: typeof FirestoreAdmin.WriteBatch
}

export type FirebaseAdminCompat = {
  app: (name?: string) => App
  auth: () => Auth
  firestore: FirestoreCompat
  storage: () => { bucket: (name?: string) => Bucket }
}
