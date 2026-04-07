import { NextResponse } from "next/server"
import { recordActivationAttempt } from "@/lib/activation-attempts"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
    if (!idToken) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const userId = body?.userId as string | undefined
    const role = body?.role as "earner" | "advertiser" | undefined
    const reference = body?.reference as string | undefined
    const provider = (body?.provider as string | undefined) || "monnify"

    if (!userId || !role || !reference) {
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

    const collectionName = role === "earner" ? "earners" : "advertisers"
    const userRef = dbAdmin.collection(collectionName).doc(userId)
    const userSnap = await userRef.get()

    if (!userSnap.exists) {
      return NextResponse.json({ success: false, message: "User profile not found" }, { status: 404 })
    }

    await userRef.update({
      pendingActivationReference: reference,
      pendingActivationReferences: admin.firestore.FieldValue.arrayUnion(reference),
      pendingActivationProvider: provider,
      activationAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    await recordActivationAttempt({
      userId,
      role,
      provider,
      reference,
      references: [reference],
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[activation][register-reference] error", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to register activation reference" },
      { status: 500 }
    )
  }
}
