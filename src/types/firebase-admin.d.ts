import type { App } from 'firebase-admin/app'
import type { Auth } from 'firebase-admin/auth'
import type * as FirestoreAdmin from 'firebase-admin/firestore'
import type { Bucket } from '@google-cloud/storage'

declare module 'firebase-admin' {
  export function app(name?: string): App
  export function auth(): Auth
  export function firestore(): FirestoreAdmin.Firestore
  export namespace firestore {
    export import FieldValue = FirestoreAdmin.FieldValue
    export import Timestamp = FirestoreAdmin.Timestamp
    export import GeoPoint = FirestoreAdmin.GeoPoint
    export import Firestore = FirestoreAdmin.Firestore
    export import CollectionReference = FirestoreAdmin.CollectionReference
    export import DocumentReference = FirestoreAdmin.DocumentReference
    export import Query = FirestoreAdmin.Query
    export import Transaction = FirestoreAdmin.Transaction
    export import WriteBatch = FirestoreAdmin.WriteBatch
  }
  export function storage(): { bucket(name?: string): Bucket }
}
