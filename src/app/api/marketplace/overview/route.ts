import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

export async function GET() {
  try {
    const { dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin) {
      return NextResponse.json({ success: false, message: "Firebase admin unavailable" }, { status: 500 })
    }

    const [productsSnap, vendorsSnap] = await Promise.all([
      dbAdmin
        .collection("vendorProducts")
        .where("visibleOnMarketplace", "==", true)
        .orderBy("updatedAt", "desc")
        .limit(120)
        .get(),
      dbAdmin
        .collection("vendors")
        .where("storeStatus", "==", "active")
        .orderBy("updatedAt", "desc")
        .limit(80)
        .get(),
    ])

    const products = productsSnap.docs.map((docItem) => {
      const data = docItem.data() as Record<string, unknown>
      return {
        id: docItem.id,
        vendorId: String(data.vendorId || ""),
        vendorName: String(data.vendorName || "Vendor"),
        title: String(data.title || ""),
        description: String(data.description || ""),
        price: Number(data.price || 0),
        category: String(data.category || "General"),
        shopLink: String(data.shopLink || ""),
        images: Array.isArray(data.images)
          ? data.images.map((value) => String(value || "")).filter(Boolean)
          : [],
      }
    })

    const vendors = vendorsSnap.docs.map((docItem) => {
      const data = docItem.data() as Record<string, unknown>
      return {
        id: docItem.id,
        name: String(data.name || data.companyName || "Vendor"),
        email: String(data.email || ""),
        storefrontLink: String(data.storefrontLink || ""),
        storefrontSlug: String(data.storefrontSlug || ""),
        vendorVerificationStatus: String(data.vendorVerificationStatus || ""),
        monthlyRentStatus: String(data.monthlyRentStatus || ""),
      }
    })

    return NextResponse.json({
      success: true,
      hasLiveProducts: products.length > 0,
      products,
      vendors,
    })
  } catch (error) {
    console.error("[marketplace][overview] load error:", error)
    return NextResponse.json({ success: false, message: "Failed to load marketplace" }, { status: 500 })
  }
}
