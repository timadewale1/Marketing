import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

type UserRole = "earner" | "advertiser"

function getCollectionName(role: UserRole) {
  return role === "earner" ? "earners" : "advertisers"
}

export function getActivationAttemptDocId(role: UserRole, userId: string) {
  return `${role}_${userId}`
}

async function getUserProfileSnapshot(userId: string, role: UserRole) {
  const { dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin) throw new Error("Firebase admin not initialized")

  const snap = await dbAdmin.collection(getCollectionName(role)).doc(userId).get()
  return snap
}

export async function recordActivationAttempt({
  userId,
  role,
  provider,
  reference,
  references = [],
}: {
  userId: string
  role: UserRole
  provider?: string
  reference: string
  references?: string[]
}) {
  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!admin || !dbAdmin) throw new Error("Firebase admin not initialized")

  const userSnap = await getUserProfileSnapshot(userId, role)
  if (!userSnap.exists) {
    throw new Error("User profile not found")
  }

  const user = userSnap.data() || {}
  const allReferences = [...new Set([reference, ...references].map((value) => String(value || "").trim()).filter(Boolean))]
  const primaryReference = allReferences[0] || String(reference || "").trim()
  const attemptRef = dbAdmin.collection("activationAttempts").doc(getActivationAttemptDocId(role, userId))

  await attemptRef.set({
    userId,
    role,
    provider: provider || "monnify",
    status: "pending",
    email: String(user.email || "").trim().toLowerCase(),
    name: String(user.fullName || user.businessName || user.name || user.companyName || "Unnamed user"),
    reference: primaryReference,
    references: admin.firestore.FieldValue.arrayUnion(...allReferences),
    pendingReference: primaryReference,
    attemptedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })
}

export async function markActivationAttemptCompleted({
  userId,
  role,
  provider,
  reference,
  references = [],
}: {
  userId: string
  role: UserRole
  provider?: string
  reference: string
  references?: string[]
}) {
  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!admin || !dbAdmin) throw new Error("Firebase admin not initialized")

  const allReferences = [...new Set([reference, ...references].map((value) => String(value || "").trim()).filter(Boolean))]
  const primaryReference = allReferences[0] || String(reference || "").trim()
  const attemptRef = dbAdmin.collection("activationAttempts").doc(getActivationAttemptDocId(role, userId))

  await attemptRef.set({
    userId,
    role,
    provider: provider || "monnify",
    status: "completed",
    reference: primaryReference,
    references: admin.firestore.FieldValue.arrayUnion(...allReferences),
    pendingReference: admin.firestore.FieldValue.delete(),
    completedReference: primaryReference,
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })
}
