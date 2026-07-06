import { FieldValue } from "firebase-admin/firestore"

export type ReviewRole = "earner" | "advertiser" | "vendor" | "customer"
export type ReviewTargetType = "submission" | "campaign" | "purchase" | "vendor"

export type ReviewPromptRecord = {
  id: string
  userId: string
  role: ReviewRole
  targetType: ReviewTargetType
  targetId: string
  targetName: string
  sourceId: string
  sourceLabel: string
  message: string
  createdAt: unknown
  resolvedAt?: unknown
}

export type PlatformReviewRecord = {
  id: string
  authorId: string
  authorName: string
  role: ReviewRole
  rating: number
  comment: string
  targetType: ReviewTargetType
  targetId: string
  targetName: string
  sourceId: string
  sourceLabel: string
  createdAt: unknown
  updatedAt: unknown
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

export function getReviewPromptId(input: {
  userId: string
  role: ReviewRole
  targetType: ReviewTargetType
  sourceId: string
}) {
  return normalize([input.role, input.userId, input.targetType, input.sourceId].join(":"))
}

export async function queueReviewPrompt(
  db: FirebaseFirestore.Firestore,
  prompt: Omit<ReviewPromptRecord, "id" | "createdAt" | "resolvedAt">,
) {
  const id = getReviewPromptId({
    userId: prompt.userId,
    role: prompt.role,
    targetType: prompt.targetType,
    sourceId: prompt.sourceId,
  })

  await db.collection("reviewPrompts").doc(id).set({
    id,
    ...prompt,
    createdAt: FieldValue.serverTimestamp(),
    resolvedAt: FieldValue.delete(),
  }, { merge: true })

  return id
}

export async function resolveReviewPrompt(db: FirebaseFirestore.Firestore, promptId: string) {
  if (!promptId) return
  await db.collection("reviewPrompts").doc(promptId).set({
    resolvedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })
}
