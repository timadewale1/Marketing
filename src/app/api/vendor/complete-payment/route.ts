import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { confirmMonnifyPaymentWithRetries, isMonnifyImmediateSuccessResponse } from "@/lib/monnify-confirmation"
import { extractMonnifyReferenceCandidates } from "@/lib/paymentProcessing"
import { syncVendorStoreEligibility } from "@/lib/vendor-store"

const PAYMENT_CONFIRMATION_RETRY_DELAYS_MS = [0, 2000, 5000, 10000, 20000, 40000, 60000, 150000]

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

function thirtyDaysFromNow(adminSdk: Awaited<ReturnType<typeof initFirebaseAdmin>>["admin"]) {
  const millis = Date.now() + (30 * 24 * 60 * 60 * 1000)
  return adminSdk?.firestore.Timestamp.fromMillis(millis)
}

export async function POST(req: Request) {
  try {
    const auth = await requireVendor(req)
    if ("error" in auth) return auth.error

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const reference = String(body.reference || "").trim()
    const purpose = String(body.purpose || "setup_fee").trim().toLowerCase()
    const provider = String(body.provider || "monnify").trim().toLowerCase()
    const monnifyResponse = body.monnifyResponse as Record<string, unknown> | undefined

    if (!reference || provider !== "monnify" || !["setup_fee", "monthly_rent"].includes(purpose)) {
      return NextResponse.json({ success: false, message: "Invalid vendor payment payload" }, { status: 400 })
    }

    let referenceCandidates = extractMonnifyReferenceCandidates(reference, monnifyResponse || null)
    const immediateSuccess = monnifyResponse ? isMonnifyImmediateSuccessResponse(monnifyResponse) : false
    let confirmed = immediateSuccess

    if (!confirmed) {
      const confirmation = await confirmMonnifyPaymentWithRetries(
        reference,
        referenceCandidates,
        PAYMENT_CONFIRMATION_RETRY_DELAYS_MS
      )
      referenceCandidates = confirmation.references
      confirmed = confirmation.confirmed
    }

    if (!confirmed) {
      return NextResponse.json({
        success: true,
        completed: false,
        pendingConfirmation: true,
        message: "Payment received. Awaiting Monnify confirmation.",
        references: referenceCandidates,
      })
    }

    const amount = purpose === "setup_fee" ? 10000 : 2000
    const now = auth.admin.firestore.FieldValue.serverTimestamp()
    const txRef = auth.dbAdmin.collection("vendorTransactions").doc(reference)
    const dueAt = thirtyDaysFromNow(auth.admin)
    const setupPaid = String(auth.vendorData.vendorPaymentStatus || "").toLowerCase() === "paid"
    const verified = Boolean(auth.vendorData.verified || String(auth.vendorData.vendorVerificationStatus || "").toLowerCase() === "verified")

    await auth.dbAdmin.runTransaction(async (t) => {
      t.set(txRef, {
        id: reference,
        userId: auth.vendorId,
        type: purpose,
        provider: "monnify",
        reference,
        amount,
        status: "completed",
        completedAt: now,
        updatedAt: now,
      }, { merge: true })

      if (purpose === "setup_fee") {
        t.set(auth.vendorRef, {
          vendorPaymentStatus: "paid",
          vendorSetupPaidAt: now,
          monthlyRentStatus: "paid",
          monthlyRentPaidAt: now,
          monthlyRentDueAt: dueAt || null,
          storeStatus: verified ? "active" : "awaiting_verification",
          updatedAt: now,
        }, { merge: true })
      } else {
        t.set(auth.vendorRef, {
          monthlyRentStatus: "paid",
          monthlyRentPaidAt: now,
          monthlyRentDueAt: dueAt || null,
          storeStatus: setupPaid && verified ? "active" : String(auth.vendorData.storeStatus || "awaiting_verification"),
          updatedAt: now,
        }, { merge: true })
      }
    })

    const vendorPostSnap = await auth.vendorRef.get()
    await syncVendorStoreEligibility(auth.dbAdmin, auth.vendorId, vendorPostSnap.data() as Record<string, unknown>)

    return NextResponse.json({ success: true, completed: true, reference: referenceCandidates[0] || reference })
  } catch (error) {
    console.error("[vendor][complete-payment] error:", error)
    return NextResponse.json({ success: false, message: "Failed to complete vendor payment" }, { status: 500 })
  }
}
