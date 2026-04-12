import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { logPaymentLifecycle } from "@/lib/payment-reconciliation"

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
    if (!idToken) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const userId = body?.userId as string | undefined
    const reference = body?.reference as string | undefined
    const amount = Number(body?.amount || 0)
    const provider = (body?.provider as string | undefined) || "monnify"

    if (!userId || !reference || !amount || amount <= 0) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: "Server admin unavailable" }, { status: 500 })
    }

    const decoded = await admin.auth().verifyIdToken(idToken)
    if (decoded.uid !== userId) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 })
    }

    const advertiserRef = dbAdmin.collection("advertisers").doc(userId)
    const advertiserSnap = await advertiserRef.get()
    if (!advertiserSnap.exists) {
      return NextResponse.json({ success: false, message: "Advertiser profile not found" }, { status: 404 })
    }

    const existingPendingSnap = await dbAdmin
      .collection("advertiserTransactions")
      .where("userId", "==", userId)
      .where("reference", "==", reference)
      .where("type", "==", "wallet_funding")
      .limit(1)
      .get()

    if (existingPendingSnap.empty) {
      await dbAdmin.collection("advertiserTransactions").add({
        userId,
        type: "wallet_funding",
        amount,
        provider,
        reference,
        referenceCandidates: [reference],
        status: "pending",
        note: `Wallet funding initiated via ${provider}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }

    await logPaymentLifecycle({
      scope: "wallet_funding",
      status: "registered",
      source: "wallet/register-funding-reference",
      provider,
      role: "advertiser",
      userId,
      email: String(advertiserSnap.data()?.email || ""),
      reference,
      references: [reference],
      amount,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[wallet][register-funding-reference] error", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to register wallet funding reference" },
      { status: 500 }
    )
  }
}
