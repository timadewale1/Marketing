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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSession()
    const { id } = await params
    const { dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin) {
      return NextResponse.json({ success: false, message: "Firebase admin unavailable" }, { status: 500 })
    }

    const productRef = dbAdmin.collection("vendorProducts").doc(id)
    const productSnap = await productRef.get()
    if (!productSnap.exists) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 })
    }
    const productData = productSnap.data() as Record<string, unknown>
    const vendorId = String(productData.vendorId || "").trim()
    let vendor: Record<string, unknown> | null = null
    if (vendorId) {
      const vendorSnap = await dbAdmin.collection("vendors").doc(vendorId).get()
      if (vendorSnap.exists) {
        const v = vendorSnap.data() as Record<string, unknown>
        vendor = {
          id: vendorSnap.id,
          name: String(v.name || v.businessName || v.companyName || "Vendor"),
          email: String(v.email || ""),
          phone: String(v.phone || ""),
          storefrontSlug: String(v.storefrontSlug || ""),
          storefrontLink: String(v.storefrontLink || ""),
          vendorVerificationStatus: String(v.vendorVerificationStatus || "pending"),
          vendorPaymentStatus: String(v.vendorPaymentStatus || "unpaid"),
          storeStatus: String(v.storeStatus || "awaiting_verification"),
        }
      }
    }

    return NextResponse.json({
      success: true,
      product: {
        id: productSnap.id,
        vendorId,
        vendorName: String(productData.vendorName || ""),
        title: String(productData.title || ""),
        description: String(productData.description || ""),
        price: Number(productData.price || 0),
        category: String(productData.category || "General"),
        status: String(productData.status || "draft"),
        visibleOnMarketplace: Boolean(productData.visibleOnMarketplace),
        images: Array.isArray(productData.images) ? productData.images.map((v) => String(v || "")).filter(Boolean) : [],
        shopLink: String(productData.shopLink || ""),
        contactMethod: String(productData.contactMethod || "whatsapp"),
        contactDetails: String(productData.contactDetails || ""),
        variations: Array.isArray(productData.variations) ? productData.variations : [],
        createdAtMs: toMillis(productData.createdAt),
        updatedAtMs: toMillis(productData.updatedAt),
      },
      vendor,
    })
  } catch (error) {
    console.error("Admin vendor product detail load error:", error)
    return NextResponse.json({ success: false, message: "Failed to load product detail" }, { status: 500 })
  }
}

