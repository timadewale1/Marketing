import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { syncVendorStoreEligibility } from "@/lib/vendor-store"

async function requireVendor(req: Request) {
  const idToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  if (!idToken) return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) }

  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!admin || !dbAdmin) {
    return { error: NextResponse.json({ success: false, message: "Firebase admin unavailable" }, { status: 500 }) }
  }

  const decoded = await admin.auth().verifyIdToken(idToken).catch(() => null)
  if (!decoded?.uid) return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) }

  const vendorRef = dbAdmin.collection("vendors").doc(decoded.uid)
  const vendorSnap = await vendorRef.get()
  if (!vendorSnap.exists) return { error: NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 }) }

  return { admin, dbAdmin, vendorId: decoded.uid, vendorRef, vendorData: vendorSnap.data() as Record<string, unknown> }
}

export async function GET(req: Request) {
  try {
    const auth = await requireVendor(req)
    if ("error" in auth) return auth.error
    await syncVendorStoreEligibility(auth.dbAdmin, auth.vendorId, auth.vendorData)
    const refreshed = await auth.vendorRef.get()
    return NextResponse.json({ success: true, profile: refreshed.data() || auth.vendorData })
  } catch (error) {
    console.error("[vendor][profile][GET] error:", error)
    return NextResponse.json({ success: false, message: "Failed to load vendor profile" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireVendor(req)
    if ("error" in auth) return auth.error

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const storefrontLink = String(body.storefrontLink || "").trim()
    const storefrontSlugRaw = String(body.storefrontSlug || "").trim().toLowerCase()
    const storefrontSlug = storefrontSlugRaw.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
    const address = String(body.address || "").trim()
    const city = String(body.city || "").trim()
    const state = String(body.state || "").trim()
    const ninNumber = String(body.ninNumber || "").trim()
    const proofOfAddressUrl = String(body.proofOfAddressUrl || "").trim()
    const ninSlipUrl = String(body.ninSlipUrl || "").trim()
    const facialVerificationUrl = String(body.facialVerificationUrl || "").trim()

    const verificationComplete = Boolean(
      address &&
      city &&
      state &&
      ninNumber &&
      proofOfAddressUrl &&
      ninSlipUrl &&
      facialVerificationUrl
    )

    if (storefrontSlug && storefrontSlug.length < 3) {
      return NextResponse.json({ success: false, message: "Store link slug must be at least 3 characters" }, { status: 400 })
    }

    if (storefrontSlug) {
      const slugSnap = await auth.dbAdmin
        .collection("vendors")
        .where("storefrontSlug", "==", storefrontSlug)
        .limit(1)
        .get()
      const existing = slugSnap.docs.find((docItem) => docItem.id !== auth.vendorId)
      if (existing) {
        return NextResponse.json({ success: false, message: "That storefront link is already in use. Try another one." }, { status: 409 })
      }
    }

    await auth.vendorRef.set({
      storefrontLink: storefrontLink || null,
      storefrontSlug: storefrontSlug || null,
      verificationDetails: {
        address: address || null,
        city: city || null,
        state: state || null,
        ninNumber: ninNumber || null,
        proofOfAddressUrl: proofOfAddressUrl || null,
        ninSlipUrl: ninSlipUrl || null,
        facialVerificationUrl: facialVerificationUrl || null,
      },
      vendorVerificationStatus: verificationComplete
        ? String(auth.vendorData.vendorVerificationStatus || "pending")
        : "pending",
      verificationSubmittedAt: verificationComplete
        ? auth.admin.firestore.FieldValue.serverTimestamp()
        : auth.admin.firestore.FieldValue.delete(),
      updatedAt: auth.admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })

    const nextVendorSnap = await auth.vendorRef.get()
    await syncVendorStoreEligibility(auth.dbAdmin, auth.vendorId, nextVendorSnap.data() as Record<string, unknown>)

    return NextResponse.json({ success: true, verificationComplete })
  } catch (error) {
    console.error("[vendor][profile][PATCH] error:", error)
    return NextResponse.json({ success: false, message: "Failed to update vendor profile" }, { status: 500 })
  }
}
