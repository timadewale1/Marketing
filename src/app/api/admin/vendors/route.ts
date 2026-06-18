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

    const [vendorsSnap, productsSnap] = await Promise.all([
      dbAdmin.collection("vendors").orderBy("updatedAt", "desc").limit(100).get(),
      dbAdmin.collection("vendorProducts").orderBy("updatedAt", "desc").limit(300).get(),
    ])

    const productsByVendor = new Map<string, number>()
    productsSnap.docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>
      const vendorId = String(data.vendorId || "")
      if (!vendorId) return
      productsByVendor.set(vendorId, (productsByVendor.get(vendorId) || 0) + 1)
    })

    const vendors = vendorsSnap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>
      return {
        id: doc.id,
        name: String(data.name || data.companyName || "Vendor"),
        email: String(data.email || ""),
        phone: String(data.phone || ""),
        vendorVerificationStatus: String(data.vendorVerificationStatus || "pending"),
        vendorPaymentStatus: String(data.vendorPaymentStatus || "unpaid"),
        monthlyRentStatus: String(data.monthlyRentStatus || "unpaid"),
        storeStatus: String(data.storeStatus || "awaiting_verification"),
        verified: Boolean(data.verified),
        productsPublishedCount: Number(data.productsPublishedCount || productsByVendor.get(doc.id) || 0),
        createdAtMs: toMillis(data.createdAt),
        updatedAtMs: toMillis(data.updatedAt),
      }
    })

    return NextResponse.json({ success: true, vendors })
  } catch (error) {
    console.error("Admin vendors load error:", error)
    return NextResponse.json({ success: false, message: "Failed to load vendors" }, { status: 500 })
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
    const vendorId = String(body.vendorId || "").trim()
    const vendorVerificationStatus = String(body.vendorVerificationStatus || "").trim().toLowerCase()
    const vendorPaymentStatus = String(body.vendorPaymentStatus || "").trim().toLowerCase()
    const monthlyRentStatus = String(body.monthlyRentStatus || "").trim().toLowerCase()
    const storeStatus = String(body.storeStatus || "").trim().toLowerCase()

    if (!vendorId) {
      return NextResponse.json({ success: false, message: "Missing vendor id" }, { status: 400 })
    }

    const updates: Record<string, unknown> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }
    if (vendorVerificationStatus) updates.vendorVerificationStatus = vendorVerificationStatus
    if (vendorPaymentStatus) updates.vendorPaymentStatus = vendorPaymentStatus
    if (monthlyRentStatus) updates.monthlyRentStatus = monthlyRentStatus
    if (storeStatus) updates.storeStatus = storeStatus
    if (vendorVerificationStatus === "verified") updates.verified = true
    if (vendorVerificationStatus === "rejected") updates.verified = false

    await dbAdmin.collection("vendors").doc(vendorId).set(updates, { merge: true })

    return NextResponse.json({ success: true, message: "Vendor updated successfully" })
  } catch (error) {
    console.error("Admin vendor update error:", error)
    return NextResponse.json({ success: false, message: "Failed to update vendor" }, { status: 500 })
  }
}
