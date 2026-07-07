import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { syncVendorStoreEligibility } from "@/lib/vendor-store"
import { buildProductContactLink, normalizeProductContactMethod } from "@/lib/vendor-products"

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

  return { admin, dbAdmin, vendorId: decoded.uid, vendorSnap }
}

function parseImages(value: unknown) {
  return Array.isArray(value) ? value.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 5) : []
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireVendor(req)
    if ("error" in auth) return auth.error

    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ success: false, message: "Missing product id" }, { status: 400 })
    }

    const productRef = auth.dbAdmin.collection("vendorProducts").doc(id)
    const productSnap = await productRef.get()
    if (!productSnap.exists) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 })
    }

    const productData = productSnap.data() as Record<string, unknown>
    if (String(productData.vendorId || "") !== auth.vendorId) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const title = String(body.title ?? productData.title ?? "").trim()
    const description = String(body.description ?? productData.description ?? "").trim()
    const price = Number(body.price ?? productData.price ?? 0)
    const category = String(body.category ?? productData.category ?? "General").trim()
    const contactMethod = normalizeProductContactMethod(body.contactMethod ?? productData.contactMethod ?? "whatsapp")
    const contactDetails = String(body.contactDetails ?? productData.contactDetails ?? "").trim()
    const images = parseImages(body.images ?? productData.images)
    const variations = parseImages(body.variations ?? productData.variations)
    const status = String(body.status ?? productData.status ?? "draft").trim().toLowerCase()
    const shopLink = String(body.shopLink ?? productData.shopLink ?? buildProductContactLink(contactMethod, contactDetails)).trim()

    if (!title || !description || !Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ success: false, message: "Title, description, and price are required" }, { status: 400 })
    }

    const vendorData = auth.vendorSnap.data() as Record<string, unknown>
    const state = await syncVendorStoreEligibility(auth.dbAdmin, auth.vendorId, vendorData)
    if (!state.canShowProducts) {
      return NextResponse.json({
        success: false,
        message: "Your store must be verified and setup fee completed before editing products.",
      }, { status: 403 })
    }
    const visibleOnMarketplace = state.canShowProducts && status !== "hidden"

    await productRef.update({
      title,
      description,
      price,
      category,
      shopLink: shopLink || buildProductContactLink(contactMethod, contactDetails) || null,
      contactMethod,
      contactDetails: contactDetails || null,
      images,
      variations,
      status: status === "active" ? "active" : status === "hidden" ? "hidden" : "draft",
      visibleOnMarketplace,
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ success: true, productId: id, visibleOnMarketplace })
  } catch (error) {
    console.error("Vendor product update error:", error)
    return NextResponse.json({ success: false, message: "Failed to update vendor product" }, { status: 500 })
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireVendor(req)
    if ("error" in auth) return auth.error

    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ success: false, message: "Missing product id" }, { status: 400 })
    }

    const productRef = auth.dbAdmin.collection("vendorProducts").doc(id)
    const productSnap = await productRef.get()
    if (!productSnap.exists) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 })
    }

    const productData = productSnap.data() as Record<string, unknown>
    if (String(productData.vendorId || "") !== auth.vendorId) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 })
    }

    const vendorData = auth.vendorSnap.data() as Record<string, unknown>
    const state = await syncVendorStoreEligibility(auth.dbAdmin, auth.vendorId, vendorData)
    if (!state.canShowProducts) {
      return NextResponse.json({
        success: false,
        message: "Your store must be verified and setup fee completed before deleting products.",
      }, { status: 403 })
    }

    await productRef.delete()
    await auth.dbAdmin.collection("vendors").doc(auth.vendorId).set({
      productsPublishedCount: FieldValue.increment(-1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Vendor product delete error:", error)
    return NextResponse.json({ success: false, message: "Failed to delete vendor product" }, { status: 500 })
  }
}
