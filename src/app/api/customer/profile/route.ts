import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

async function requireCustomer(req: Request) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: NextResponse.json({ success: false, message: "Missing Authorization token" }, { status: 401 }) }
  }
  const idToken = authHeader.split("Bearer ")[1]
  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!admin || !dbAdmin) {
    return { error: NextResponse.json({ success: false, message: "Firebase admin unavailable" }, { status: 500 }) }
  }
  const decoded = await admin.auth().verifyIdToken(idToken)
  const customerRef = dbAdmin.collection("customers").doc(decoded.uid)
  const customerSnap = await customerRef.get()
  if (!customerSnap.exists) {
    return { error: NextResponse.json({ success: false, message: "Customer profile not found" }, { status: 404 }) }
  }
  return { admin, dbAdmin, uid: decoded.uid, customerRef, customerSnap }
}

export async function GET(req: Request) {
  try {
    const auth = await requireCustomer(req)
    if ("error" in auth) return auth.error
    return NextResponse.json({ success: true, profile: auth.customerSnap.data() || {} })
  } catch (error) {
    console.error("[customer][profile][GET] error:", error)
    return NextResponse.json({ success: false, message: "Failed to load customer profile" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireCustomer(req)
    if ("error" in auth) return auth.error
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const bankName = String(body.bankName || "").trim()
    const bankCode = String(body.bankCode || "").trim()
    const accountNumber = String(body.accountNumber || "").trim()
    const accountName = String(body.accountName || "").trim()
    if (!bankName || !bankCode || !accountNumber || !accountName) {
      return NextResponse.json({ success: false, message: "Complete bank details are required." }, { status: 400 })
    }

    await auth.customerRef.set(
      {
        bank: {
          bankName,
          bankCode,
          accountNumber,
          accountName,
          verified: true,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    return NextResponse.json({ success: true, message: "Customer profile updated" })
  } catch (error) {
    console.error("[customer][profile][PATCH] error:", error)
    return NextResponse.json({ success: false, message: "Failed to update customer profile" }, { status: 500 })
  }
}
