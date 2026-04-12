import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, message: "Missing Authorization token" }, { status: 401 })
    }

    const idToken = authHeader.slice("Bearer ".length)
    const body = await req.json()
    const proofUrls = Array.isArray(body?.proofUrls)
      ? body.proofUrls.map((value: unknown) => String(value || "").trim()).filter(Boolean).slice(0, 5)
      : []

    if (proofUrls.length === 0) {
      return NextResponse.json({ success: false, message: "At least one proof is required" }, { status: 400 })
    }

    const { id } = await params
    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: "Server admin unavailable" }, { status: 500 })
    }

    const decoded = await admin.auth().verifyIdToken(idToken)
    const submissionRef = dbAdmin.collection("earnerSubmissions").doc(id)
    const submissionSnap = await submissionRef.get()
    if (!submissionSnap.exists) {
      return NextResponse.json({ success: false, message: "Submission not found" }, { status: 404 })
    }

    const submission = submissionSnap.data() as { userId?: string; status?: string }
    if (String(submission.userId || "") !== decoded.uid) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 })
    }

    const status = String(submission.status || "")
    if (status === "Verified" || status === "Rejected") {
      return NextResponse.json({ success: false, message: "This submission can no longer be updated" }, { status: 400 })
    }

    await submissionRef.set({
      proofUrl: proofUrls[0],
      proofUrls,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Earner submission update error:", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to update submission" },
      { status: 500 }
    )
  }
}
