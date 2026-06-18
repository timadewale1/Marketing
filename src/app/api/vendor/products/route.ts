import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

function toMillis(value: unknown) {
  if (!value) return 0
  if (typeof value === "object" && value !== null && "seconds" in value) {
    return Number((value as { seconds?: number }).seconds || 0) * 1000
  }
  if (value instanceof Date) return value.getTime()
  return 0
}

async function requireVendor(req: Request) {
  const idToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  if (!idToken) {
    return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) }
  }

  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!admin || !dbAdmin) {
    return { error: NextResponse.json({ success: false, message: "Firebase admin unavailable" }, { status: 500 }) }
  }

  const decoded = await admin.auth().verifyIdToken(idToken).catch(() => null)
  if (!decoded?.uid) {
    return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) }
  }

  const vendorSnap = await dbAdmin.collection("vendors").doc(decoded.uid).get()
  if (!vendorSnap.exists) {
    return { error: NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 }) }
  }

  return { admin, dbAdmin, vendorSnap, vendorId: decoded.uid }
}

export async function GET(req: Request) {
  try {
    const auth = await requireVendor(req)
    if ("error" in auth) return auth.error

    const snap = await auth.dbAdmin
      .collection("vendorProducts")
      .where("vendorId", "==", auth.vendorId)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get()

    const products = snap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>
      return {
        id: doc.id,
        vendorId: String(data.vendorId || auth.vendorId),
        vendorName: String(data.vendorName || auth.vendorSnap.data()?.name || "Vendor"),
        shopLink: String(data.shopLink || ""),
        title: String(data.title || ""),
        description: String(data.description || ""),
        category: String(data.category || ""),
        price: Number(data.price || 0),
        images: Array.isArray(data.images) ? data.images.map((value) => String(value || "")).filter(Boolean) : [],
        contactMethod: String(data.contactMethod || "whatsapp"),
        contactDetails: String(data.contactDetails || ""),
        status: String(data.status || "draft"),
        visibleOnMarketplace: Boolean(data.visibleOnMarketplace),
        createdAtMs: toMillis(data.createdAt),
      }
    })

    return NextResponse.json({ success: true, products })
  } catch (error) {
    console.error("Vendor products load error:", error)
    return NextResponse.json({ success: false, message: "Failed to load vendor products" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireVendor(req)
    if ("error" in auth) return auth.error

    const body = await req.json().catch(() => ({})) as {
      title?: string
      description?: string
      price?: number
      category?: string
      shopLink?: string
      contactMethod?: string
      contactDetails?: string
      images?: string[]
      variations?: string[]
    }

    const title = String(body.title || "").trim()
    const description = String(body.description || "").trim()
    const price = Number(body.price || 0)
    const category = String(body.category || "").trim()
    const shopLink = String(body.shopLink || "").trim()
    const contactMethod = String(body.contactMethod || "whatsapp").trim().toLowerCase()
    const contactDetails = String(body.contactDetails || "").trim()
    const images = Array.isArray(body.images) ? body.images.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 6) : []
    const variations = Array.isArray(body.variations) ? body.variations.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 12) : []

    if (!title || !description || !Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ success: false, message: "Title, description, and price are required" }, { status: 400 })
    }

    const vendorData = auth.vendorSnap.data() as Record<string, unknown>
    const isVerified = Boolean(vendorData.verified || String(vendorData.vendorVerificationStatus || "").toLowerCase() === "verified")
    const rentPaid = String(vendorData.monthlyRentStatus || "").toLowerCase() === "paid"
    const visibleOnMarketplace = isVerified && rentPaid
    const status = visibleOnMarketplace ? "active" : "hidden"
    const productsRef = auth.dbAdmin.collection("vendorProducts").doc()
    const now = auth.admin.firestore.FieldValue.serverTimestamp()

    await productsRef.set({
      id: productsRef.id,
      vendorId: auth.vendorId,
      vendorName: String(vendorData.name || vendorData.companyName || "Vendor"),
      title,
      description,
      price,
      category: category || "General",
      shopLink: shopLink || null,
      contactMethod: contactMethod || "whatsapp",
      contactDetails: contactDetails || null,
      images,
      variations,
      status,
      visibleOnMarketplace,
      createdAt: now,
      updatedAt: now,
    })

    await auth.dbAdmin.collection("vendors").doc(auth.vendorId).set({
      productsPublishedCount: auth.admin.firestore.FieldValue.increment(1),
      updatedAt: now,
    }, { merge: true })

    return NextResponse.json({ success: true, productId: productsRef.id, status, visibleOnMarketplace })
  } catch (error) {
    console.error("Vendor products create error:", error)
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed to save vendor product" }, { status: 500 })
  }
}
