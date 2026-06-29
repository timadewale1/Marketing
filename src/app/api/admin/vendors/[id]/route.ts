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

    const vendorRef = dbAdmin.collection("vendors").doc(id)
    const vendorSnap = await vendorRef.get()
    if (!vendorSnap.exists) {
      return NextResponse.json({ success: false, message: "Vendor not found" }, { status: 404 })
    }

    const vendorData = vendorSnap.data() as Record<string, unknown>
    const productsSnap = await dbAdmin
      .collection("vendorProducts")
      .where("vendorId", "==", id)
      .orderBy("updatedAt", "desc")
      .limit(500)
      .get()

    const products = productsSnap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>
      return {
        id: doc.id,
        title: String(data.title || ""),
        description: String(data.description || ""),
        price: Number(data.price || 0),
        category: String(data.category || "General"),
        status: String(data.status || "draft"),
        visibleOnMarketplace: Boolean(data.visibleOnMarketplace),
        images: Array.isArray(data.images) ? data.images.map((value) => String(value || "")).filter(Boolean) : [],
        shopLink: String(data.shopLink || ""),
        contactMethod: String(data.contactMethod || "whatsapp"),
        contactDetails: String(data.contactDetails || ""),
        createdAtMs: toMillis(data.createdAt),
        updatedAtMs: toMillis(data.updatedAt),
      }
    })

    return NextResponse.json({
      success: true,
      vendor: {
        id: vendorSnap.id,
        name: String(vendorData.name || vendorData.businessName || vendorData.companyName || "Vendor"),
        email: String(vendorData.email || ""),
        phone: String(vendorData.phone || ""),
        address: String(vendorData.address || ""),
        verified: Boolean(vendorData.vendorVerified),
        vendorVerificationStatus: String(vendorData.vendorVerificationStatus || "pending"),
        vendorPaymentStatus: String(vendorData.vendorPaymentStatus || "unpaid"),
        monthlyRentStatus: String(vendorData.monthlyRentStatus || "unpaid"),
        storeStatus: String(vendorData.storeStatus || "awaiting_verification"),
        storefrontLink: String(vendorData.storefrontLink || ""),
        storefrontSlug: String(vendorData.storefrontSlug || ""),
        storeCoverUrl: String(vendorData.storeCoverUrl || ""),
        verificationDetails: vendorData.verificationDetails || {},
        bank: vendorData.bank || {},
        productsPublishedCount: Number(vendorData.productsPublishedCount || products.length),
        balance: Number(vendorData.balance || 0),
        totalEarned: Number(vendorData.totalEarned || 0),
        createdAtMs: toMillis(vendorData.createdAt),
        updatedAtMs: toMillis(vendorData.updatedAt),
      },
      products,
    })
  } catch (error) {
    console.error("Admin vendor detail load error:", error)
    return NextResponse.json({ success: false, message: "Failed to load vendor detail" }, { status: 500 })
  }
}

