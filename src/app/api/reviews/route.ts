import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

const REVIEW_COLLECTION = "platformReviews"

type ReviewRole = "earner" | "advertiser" | "vendor" | "customer"

async function requireUser(req: Request) {
  const idToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  if (!idToken) return null

  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!admin || !dbAdmin) return null

  const decoded = await admin.auth().verifyIdToken(idToken).catch(() => null)
  if (!decoded?.uid) return null

  const [earnerSnap, advertiserSnap, vendorSnap, customerSnap] = await Promise.all([
    dbAdmin.collection("earners").doc(decoded.uid).get(),
    dbAdmin.collection("advertisers").doc(decoded.uid).get(),
    dbAdmin.collection("vendors").doc(decoded.uid).get(),
    dbAdmin.collection("customers").doc(decoded.uid).get(),
  ])

  const role: ReviewRole | null = earnerSnap.exists
    ? "earner"
    : advertiserSnap.exists
      ? "advertiser"
      : vendorSnap.exists
        ? "vendor"
        : customerSnap.exists
          ? "customer"
          : null

  const profile = earnerSnap.exists
    ? earnerSnap.data()
    : advertiserSnap.exists
      ? advertiserSnap.data()
      : vendorSnap.exists
        ? vendorSnap.data()
        : customerSnap.exists
          ? customerSnap.data()
          : null

  if (!role || !profile) return null

  return { admin, dbAdmin, userId: decoded.uid, role, profile: profile as Record<string, unknown> }
}

function stringifyReviewRole(value: unknown): ReviewRole | "all" {
  const normalized = String(value || "").toLowerCase()
  if (normalized === "earner" || normalized === "advertiser" || normalized === "vendor" || normalized === "customer") return normalized
  return "all"
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const mode = url.searchParams.get("mode") || "feed"
    const pendingUser = mode === "pending" ? await requireUser(req) : null
    const dbAdmin = pendingUser?.dbAdmin ?? null
    const userId = pendingUser?.userId ?? ""

    const { dbAdmin: publicDb } = await initFirebaseAdmin()
    const db = dbAdmin || publicDb
    if (!db) {
      return NextResponse.json({ success: false, message: "Firebase not initialized" }, { status: 500 })
    }

    if (mode === "pending") {
      if (!dbAdmin || !userId) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
      }
      const role = stringifyReviewRole(url.searchParams.get("role"))
      const snap = await db.collection("reviewPrompts")
        .where("userId", "==", userId)
        .where("resolvedAt", "==", null)
        .limit(20)
        .get()
      const prompts: Array<Record<string, unknown> & { id: string }> = snap.docs
        .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Record<string, unknown>) }))
        .filter((prompt: Record<string, unknown> & { id: string }) => role === "all" || String(prompt.role || "").toLowerCase() === role)
      return NextResponse.json({ success: true, prompts })
    }

    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 8), 1), 20)
    const snap = await db.collection(REVIEW_COLLECTION).orderBy("createdAt", "desc").limit(limit).get()
    const reviews = snap.docs.map((docItem) => ({
      id: docItem.id,
      ...(docItem.data() as Record<string, unknown>),
    }))
    return NextResponse.json({ success: true, reviews })
  } catch (error) {
    console.error("[reviews][GET]", error)
    return NextResponse.json({ success: false, message: "Failed to load reviews" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req)
    if (!user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const rating = Math.max(1, Math.min(5, Math.floor(Number(body.rating || 0))))
    const comment = String(body.comment || "").trim()
    const targetType = String(body.targetType || "").trim() as "submission" | "campaign" | "purchase" | "vendor"
    const targetId = String(body.targetId || "").trim()
    const targetName = String(body.targetName || "").trim()
    const sourceId = String(body.sourceId || "").trim()
    const sourceLabel = String(body.sourceLabel || "").trim()
    const promptId = String(body.promptId || "").trim()

    if (!rating || !comment || !targetType || !targetId || !sourceId || !sourceLabel) {
      return NextResponse.json({ success: false, message: "Rating and comment are required" }, { status: 400 })
    }

    const reviewRef = user.dbAdmin.collection(REVIEW_COLLECTION).doc()
    await user.dbAdmin.runTransaction(async (transaction) => {
      transaction.set(reviewRef, {
        id: reviewRef.id,
        authorId: user.userId,
        authorName: String(user.profile.fullName || user.profile.name || user.profile.email || "User"),
        role: user.role,
        rating,
        comment,
        targetType,
        targetId,
        targetName,
        sourceId,
        sourceLabel,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })

      if (promptId) {
        transaction.set(user.dbAdmin.collection("reviewPrompts").doc(promptId), {
          resolvedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[reviews][POST]", error)
    return NextResponse.json({ success: false, message: "Failed to submit review" }, { status: 500 })
  }
}
