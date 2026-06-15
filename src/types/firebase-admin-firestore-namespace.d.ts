declare module 'firebase-admin' {
  export const firestore: typeof import('firebase-admin/firestore') &
    (() => import('firebase-admin/firestore').Firestore)
  export const auth: typeof import('firebase-admin/auth') &
    (() => import('firebase-admin/auth').Auth)

  namespace auth {
    type Auth = import('firebase-admin/auth').Auth
  }

  namespace firestore {
    type Firestore = import('firebase-admin/firestore').Firestore
    type DocumentReference = import('firebase-admin/firestore').DocumentReference
    type DocumentSnapshot = import('firebase-admin/firestore').DocumentSnapshot
    type QueryDocumentSnapshot = import('firebase-admin/firestore').QueryDocumentSnapshot
    type Transaction = import('firebase-admin/firestore').Transaction
    type FieldValue = import('firebase-admin/firestore').FieldValue
    type Timestamp = import('firebase-admin/firestore').Timestamp
  }
}
