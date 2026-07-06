import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { requireAdminSession } from "@/lib/admin-session"

export async function GET(req: Request) {
  try {
    const sessionResult = await requireAdminSession()
    if ("errorResponse" in sessionResult) return sessionResult.errorResponse as Response

    const url = new URL(req.url)
    const search = String(url.searchParams.get("search") || "").trim().toLowerCase()
    const role = String(url.searchParams.get("role") || "").trim().toLowerCase()
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 500)
    const { dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin) {
      return NextResponse.json({ success: false, message: "Firebase not initialized" }, { status: 500 })
    }

    const query = dbAdmin.collection("platformReviews").orderBy("createdAt", "desc").limit(limit)
    const snap = await query.get()
    const reviews: Array<Record<string, unknown> & { id: string }> = snap.docs
      .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Record<string, unknown>) }))
      .filter((review: Record<string, unknown> & { id: string }) => {
        const matchSearch = !search || [
          review.authorName,
          review.comment,
          review.targetName,
          review.role,
          review.sourceLabel,
        ].some((value) => String(value || "").toLowerCase().includes(search))
        const matchRole = !role || String(review.role || "").toLowerCase() === role
        return matchSearch && matchRole
      })

    return NextResponse.json({ success: true, reviews })
  } catch (error) {
    console.error("[admin][reviews][GET]", error)
    return NextResponse.json({ success: false, message: "Failed to load reviews" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const sessionResult = await requireAdminSession()
    if ("errorResponse" in sessionResult) return sessionResult.errorResponse as Response

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const id = String(body.id || "").trim()
    if (!id) {
      return NextResponse.json({ success: false, message: "Review id is required" }, { status: 400 })
    }

    const { dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin) {
      return NextResponse.json({ success: false, message: "Firebase not initialized" }, { status: 500 })
    }

    await dbAdmin.collection("platformReviews").doc(id).delete()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[admin][reviews][DELETE]", error)
    return NextResponse.json({ success: false, message: "Failed to delete review" }, { status: 500 })
  }
}
