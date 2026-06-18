import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!id) return NextResponse.json({ success: false, message: "Missing product id" }, { status: 400 })

    const { dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin) return NextResponse.json({ success: false, message: "Firebase admin unavailable" }, { status: 500 })

    const productSnap = await dbAdmin.collection("vendorProducts").doc(id).get()
    if (!productSnap.exists) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 })
    }

    const productData = productSnap.data() as Record<string, unknown>
    if (!Boolean(productData.visibleOnMarketplace)) {
      return NextResponse.json({ success: false, message: "Product is not currently available" }, { status: 404 })
    }

    const vendorId = String(productData.vendorId || "")
    const vendorSnap = vendorId ? await dbAdmin.collection("vendors").doc(vendorId).get() : null
    const vendorData = vendorSnap?.exists ? (vendorSnap.data() as Record<string, unknown>) : {}

    return NextResponse.json({
      success: true,
      product: {
        id: productSnap.id,
        vendorId,
        vendorName: String(productData.vendorName || vendorData.name || "Vendor"),
        title: String(productData.title || ""),
        description: String(productData.description || ""),
        price: Number(productData.price || 0),
        category: String(productData.category || "General"),
        contactMethod: String(productData.contactMethod || "whatsapp"),
        contactDetails: String(productData.contactDetails || ""),
        shopLink: String(productData.shopLink || vendorData.storefrontLink || ""),
        images: Array.isArray(productData.images) ? productData.images.map((v) => String(v || "")).filter(Boolean) : [],
      },
      vendor: {
        id: vendorId,
        name: String(vendorData.name || vendorData.companyName || productData.vendorName || "Vendor"),
        storefrontLink: String(vendorData.storefrontLink || ""),
        storefrontSlug: String(vendorData.storefrontSlug || ""),
      },
    })
  } catch (error) {
    console.error("[marketplace][product] load error:", error)
    return NextResponse.json({ success: false, message: "Failed to load product details" }, { status: 500 })
  }
}
