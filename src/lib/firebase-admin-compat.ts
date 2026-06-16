import type { Bucket } from '@google-cloud/storage'
import type { App } from 'firebase-admin/app'
import type { UserRecord } from 'firebase-admin/auth'
import type * as FirestoreAdmin from 'firebase-admin/firestore'

export type FirestoreCompat = typeof FirestoreAdmin & (() => FirestoreAdmin.Firestore)

export type FirebaseUserCompat = UserRecord

export type FirebaseAuthCompat = {
  verifyIdToken: (token: string, checkRevoked?: boolean) => Promise<{ uid: string; email?: string } & Record<string, unknown>>
  verifySessionCookie: (cookie: string, checkRevoked?: boolean) => Promise<{ uid: string; email?: string } & Record<string, unknown>>
  createSessionCookie: (idToken: string, options: { expiresIn: number }) => Promise<string>
  getUserByEmail: (email: string) => Promise<FirebaseUserCompat>
  createUser: (properties: Record<string, unknown>) => Promise<FirebaseUserCompat>
  generateEmailVerificationLink: (email: string, actionCodeSettings?: Record<string, unknown>) => Promise<string>
  deleteUser: (uid: string) => Promise<void>
  getUser: (uid: string) => Promise<FirebaseUserCompat>
  generatePasswordResetLink: (email: string, actionCodeSettings?: Record<string, unknown>) => Promise<string>
  createCustomToken: (uid: string, developerClaims?: Record<string, unknown>) => Promise<string>
}

export type FirebaseAdminCompat = {
  app: (name?: string) => App
  auth: () => FirebaseAuthCompat
  firestore: FirestoreCompat
  storage: () => { bucket: (name?: string) => Bucket }
}
