import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

async function loadVendorAndProducts(vendorId: string) {
  const { dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin) return { error: NextResponse.json({ success: false, message: "Firebase admin unavailable" }, { status: 500 }) }

  const vendorSnap = await dbAdmin.collection("vendors").doc(vendorId).get()
  if (!vendorSnap.exists) return { error: NextResponse.json({ success: false, message: "Vendor not found" }, { status: 404 }) }
  const vendorData = vendorSnap.data() as Record<string, unknown>
  if (String(vendorData.storeStatus || "").toLowerCase() !== "active") {
    return { error: NextResponse.json({ success: false, message: "Vendor shop is currently unavailable" }, { status: 404 }) }
  }

  const productsSnap = await dbAdmin
    .collection("vendorProducts")
    .where("vendorId", "==", vendorId)
    .where("visibleOnMarketplace", "==", true)
    .orderBy("updatedAt", "desc")
    .limit(120)
    .get()

  return {
    vendor: {
      id: vendorSnap.id,
      name: String(vendorData.name || vendorData.companyName || "Vendor"),
      email: String(vendorData.email || ""),
      storefrontLink: String(vendorData.storefrontLink || ""),
      storefrontSlug: String(vendorData.storefrontSlug || ""),
      city: String((vendorData.verificationDetails as Record<string, unknown> | undefined)?.city || ""),
      state: String((vendorData.verificationDetails as Record<string, unknown> | undefined)?.state || ""),
    },
    products: productsSnap.docs.map((docItem) => {
      const data = docItem.data() as Record<string, unknown>
      return {
        id: docItem.id,
        title: String(data.title || ""),
        description: String(data.description || ""),
        price: Number(data.price || 0),
        category: String(data.category || "General"),
        images: Array.isArray(data.images) ? data.images.map((v) => String(v || "")).filter(Boolean) : [],
        shopLink: String(data.shopLink || ""),
      }
    }),
  }
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!id) return NextResponse.json({ success: false, message: "Missing vendor id" }, { status: 400 })

    const result = await loadVendorAndProducts(id)
    if ("error" in result) return result.error
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error("[marketplace][vendor] load error:", error)
    return NextResponse.json({ success: false, message: "Failed to load vendor store" }, { status: 500 })
  }
}
