import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
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

    const snap = await dbAdmin.collection("vendorProducts").orderBy("updatedAt", "desc").limit(200).get()
    const products = snap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>
      return {
        id: doc.id,
        vendorId: String(data.vendorId || ""),
        vendorName: String(data.vendorName || "Vendor"),
        title: String(data.title || ""),
        description: String(data.description || ""),
        price: Number(data.price || 0),
        category: String(data.category || "General"),
        shopLink: String(data.shopLink || ""),
        contactMethod: String(data.contactMethod || "whatsapp"),
        contactDetails: String(data.contactDetails || ""),
        status: String(data.status || "draft"),
        visibleOnMarketplace: Boolean(data.visibleOnMarketplace),
        images: Array.isArray(data.images) ? data.images.map((value) => String(value || "")).filter(Boolean) : [],
        createdAtMs: toMillis(data.createdAt),
        updatedAtMs: toMillis(data.updatedAt),
      }
    })

    return NextResponse.json({ success: true, products })
  } catch (error) {
    console.error("Admin vendor products load error:", error)
    return NextResponse.json({ success: false, message: "Failed to load vendor products" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdminSession()
    const { dbAdmin, admin } = await initFirebaseAdmin()
    if (!dbAdmin || !admin) {
      return NextResponse.json({ success: false, message: "Firebase admin unavailable" }, { status: 500 })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const productId = String(body.productId || "").trim()
    const status = String(body.status || "").trim().toLowerCase()
    const visibleOnMarketplace = typeof body.visibleOnMarketplace === "boolean" ? body.visibleOnMarketplace : null

    if (!productId) {
      return NextResponse.json({ success: false, message: "Missing product id" }, { status: 400 })
    }

    const updates: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (status) updates.status = status
    if (visibleOnMarketplace !== null) updates.visibleOnMarketplace = visibleOnMarketplace

    await dbAdmin.collection("vendorProducts").doc(productId).set(updates, { merge: true })

    return NextResponse.json({ success: true, message: "Product updated successfully" })
  } catch (error) {
    console.error("Admin vendor product update error:", error)
    return NextResponse.json({ success: false, message: "Failed to update vendor product" }, { status: 500 })
  }
}
