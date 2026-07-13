import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { syncVendorStoreEligibility } from "@/lib/vendor-store"
import { sendVendorVerificationSubmittedEmail } from "@/lib/mailer"

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
    const currentStatus = String(auth.vendorData.vendorVerificationStatus || "").toLowerCase()
    const bootstrapUpdates: Record<string, unknown> = {}
    if (!currentStatus) bootstrapUpdates.vendorVerificationStatus = "pending"
    if (auth.vendorData.vendorVerified === undefined) bootstrapUpdates.vendorVerified = false
    if (auth.vendorData.vendorPaymentStatus === undefined) bootstrapUpdates.vendorPaymentStatus = "unpaid"
    if (auth.vendorData.monthlyRentStatus === undefined) bootstrapUpdates.monthlyRentStatus = "unpaid"
    if (auth.vendorData.storeStatus === undefined) bootstrapUpdates.storeStatus = "awaiting_verification"
    if (auth.vendorData.vendorVerificationRejectionReason === undefined) bootstrapUpdates.vendorVerificationRejectionReason = ""
    if (Object.keys(bootstrapUpdates).length > 0) {
      bootstrapUpdates.updatedAt = auth.admin.firestore.FieldValue.serverTimestamp()
      await auth.vendorRef.set(bootstrapUpdates, { merge: true })
    }
    const normalizedSnap = await auth.vendorRef.get()
    await syncVendorStoreEligibility(
      auth.dbAdmin,
      auth.vendorId,
      normalizedSnap.data() as Record<string, unknown>
    )
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
    const updateType = String(body.updateType || "verification").trim().toLowerCase()
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
    const bankName = String(body.bankName || "").trim()
    const bankCode = String(body.bankCode || "").trim()
    const accountNumber = String(body.accountNumber || "").trim()
    const accountName = String(body.accountName || "").trim()
    const storeCoverUrl = String(body.storeCoverUrl || "").trim()
    const shopLayout = String(body.shopLayout || "").trim().toLowerCase()
    const shopTheme = String(body.shopTheme || "").trim().toLowerCase()

    const verificationComplete = Boolean(
      storefrontLink &&
      storefrontSlug &&
      storeCoverUrl &&
      address &&
      city &&
      state &&
      ninNumber &&
      proofOfAddressUrl &&
      ninSlipUrl &&
      facialVerificationUrl &&
      bankName &&
      bankCode &&
      accountNumber &&
      accountName
    )
    if (storefrontSlug.length > 0 && storefrontSlug.length < 3) {
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

    if (updateType === "verification" && !verificationComplete) {
      return NextResponse.json({
        success: false,
        message: "Please complete all verification fields, upload all documents, add your store cover, and set your store link details before submitting.",
      }, { status: 400 })
    }

    const updates: Record<string, unknown> = {
      storefrontLink: storefrontLink || null,
      storefrontSlug: storefrontSlug || null,
      storeCoverUrl: storeCoverUrl || null,
      updatedAt: auth.admin.firestore.FieldValue.serverTimestamp(),
    }

    if (shopLayout) updates.shopLayout = shopLayout
    if (shopTheme) updates.shopTheme = shopTheme

    if (updateType === "verification") {
      updates.verificationDetails = {
        address: address || null,
        city: city || null,
        state: state || null,
        ninNumber: ninNumber || null,
        proofOfAddressUrl: proofOfAddressUrl || null,
        ninSlipUrl: ninSlipUrl || null,
        facialVerificationUrl: facialVerificationUrl || null,
      }
      updates.bank = {
        bankName: bankName || null,
        bankCode: bankCode || null,
        accountNumber: accountNumber || null,
        accountName: accountName || null,
        verified: Boolean(bankName && bankCode && accountNumber && accountName),
      }
      updates.vendorVerificationStatus = "pending"
      updates.vendorVerified = false
      updates.vendorVerificationRejectionReason = String(auth.vendorData.vendorVerificationRejectionReason || "")
      updates.verificationSubmittedAt = auth.admin.firestore.FieldValue.serverTimestamp()
      updates.vendorSetupFeePrompt = true
    }

    await auth.vendorRef.set(updates, { merge: true })

    const nextVendorSnap = await auth.vendorRef.get()
    await syncVendorStoreEligibility(auth.dbAdmin, auth.vendorId, nextVendorSnap.data() as Record<string, unknown>)

    if (updateType === "verification") {
      await sendVendorVerificationSubmittedEmail({
        vendorName: String(auth.vendorData.name || auth.vendorData.companyName || "Vendor"),
        email: String(auth.vendorData.email || ""),
      }).catch((error) => {
        console.error("[vendor][profile][PATCH] admin alert failed:", error)
      })
    }

    return NextResponse.json({ success: true, verificationComplete, updateType })
  } catch (error) {
    console.error("[vendor][profile][PATCH] error:", error)
    return NextResponse.json({ success: false, message: "Failed to update vendor profile" }, { status: 500 })
  }
}
