import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

async function requireVendor(req: Request) {
  const idToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  if (!idToken) return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) }

  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!admin || !dbAdmin) {
    return { error: NextResponse.json({ success: false, message: "Firebase admin unavailable" }, { status: 500 }) }
  }

  const decoded = await admin.auth().verifyIdToken(idToken).catch(() => null)
  if (!decoded?.uid) return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) }

  const vendorSnap = await dbAdmin.collection("vendors").doc(decoded.uid).get()
  if (!vendorSnap.exists) return { error: NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 }) }

  return { admin, dbAdmin, vendorId: decoded.uid }
}

export async function POST(req: Request) {
  try {
    const auth = await requireVendor(req)
    if ("error" in auth) return auth.error

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const reference = String(body.reference || "").trim()
    const purpose = String(body.purpose || "setup_fee").trim().toLowerCase()
    const amount = Math.floor(Number(body.amount || 0))

    if (!reference || amount <= 0 || !["setup_fee", "monthly_rent"].includes(purpose)) {
      return NextResponse.json({ success: false, message: "Invalid payment reference payload" }, { status: 400 })
    }

    const now = auth.admin.firestore.FieldValue.serverTimestamp()
    const txRef = auth.dbAdmin.collection("vendorTransactions").doc(reference)

    await txRef.set({
      id: reference,
      userId: auth.vendorId,
      type: purpose,
      provider: "monnify",
      reference,
      amount,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    }, { merge: true })

    await auth.dbAdmin.collection("vendors").doc(auth.vendorId).set({
      pendingVendorPaymentReference: reference,
      pendingVendorPaymentReferences: auth.admin.firestore.FieldValue.arrayUnion(reference),
      updatedAt: now,
    }, { merge: true })

    return NextResponse.json({ success: true, reference })
  } catch (error) {
    console.error("[vendor][register-payment-reference] error:", error)
    return NextResponse.json({ success: false, message: "Failed to register vendor payment reference" }, { status: 500 })
  }
}
