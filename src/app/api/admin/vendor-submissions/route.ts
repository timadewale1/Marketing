import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/admin-session"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

function toMillis(value: unknown) {
  if (!value) return 0
  if (typeof value === "object" && value !== null && "seconds" in value) {
    return Number((value as { seconds?: number }).seconds || 0) * 1000
  }
  if (value instanceof Date) return value.getTime()
  return 0
}

export async function GET() {
  try {
    await requireAdminSession()
    const { dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin) {
      return NextResponse.json({ success: false, message: "Firebase admin unavailable" }, { status: 500 })
    }

    const snap = await dbAdmin.collection("vendorPurchaseSubmissions").orderBy("createdAt", "desc").limit(200).get()
    const submissions = snap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>
      return {
        id: doc.id,
        userId: String(data.userId || ""),
        userName: String(data.userName || data.fullName || ""),
        userEmail: String(data.userEmail || data.email || ""),
        vendorName: String(data.vendorName || ""),
        productId: String(data.productId || ""),
        amount: Number(data.amount || 0),
        cashbackAmount: Number(data.cashbackAmount || 0),
        pointsAmount: Number(data.pointsAmount || 0),
        rewardType: String(data.rewardType || "cashback"),
        status: String(data.status || "pending"),
        reason: String(data.reason || ""),
        createdAtMs: toMillis(data.createdAt),
        updatedAtMs: toMillis(data.updatedAt),
      }
    })

    return NextResponse.json({ success: true, submissions })
  } catch (error) {
    console.error("Admin vendor submissions load error:", error)
    return NextResponse.json({ success: false, message: "Failed to load vendor submissions" }, { status: 500 })
  }
}
