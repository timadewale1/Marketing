import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import type { DocumentReference } from "firebase-admin/firestore"

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
    const proofHashes = Array.isArray(body?.proofHashes)
      ? body.proofHashes.map((value: unknown) => String(value || "").trim().toLowerCase()).filter(Boolean).slice(0, 5)
      : []
    const disputeReason = String(body?.disputeReason || "").trim()

    if (proofUrls.length === 0 && disputeReason.length === 0) {
      return NextResponse.json({ success: false, message: "At least one proof or dispute note is required" }, { status: 400 })
    }
    if (proofUrls.length > 0 && proofHashes.length !== proofUrls.length) {
      return NextResponse.json({ success: false, message: "Proof file metadata is incomplete" }, { status: 400 })
    }
    if (new Set(proofHashes).size !== proofHashes.length) {
      return NextResponse.json({ success: false, message: "Duplicate proof files are not allowed" }, { status: 400 })
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
    const advertiserDecisionStatus = String((submission as { advertiserDecisionStatus?: string }).advertiserDecisionStatus || "").toLowerCase()
    const resubmissionStatus = String((submission as { resubmissionStatus?: string }).resubmissionStatus || "").toLowerCase()
    const resubmissionSubmittedAt = (submission as { resubmissionSubmittedAt?: unknown }).resubmissionSubmittedAt
    const canOpenForReview =
      advertiserDecisionStatus === "resubmission_requested" || resubmissionStatus === "submitted" || Boolean(resubmissionSubmittedAt)
    const updates: Record<string, unknown> = {}

    if (proofUrls.length > 0) {
      if ((status === "Verified" || status === "Rejected") && !canOpenForReview) {
        return NextResponse.json({ success: false, message: "This submission can no longer be updated" }, { status: 400 })
      }
      const fingerprintRefs = proofHashes.map((hash: string) => dbAdmin.collection("proofFingerprints").doc(hash))
      const fingerprintSnaps = await Promise.all(fingerprintRefs.map((ref: DocumentReference) => ref.get()))
      if (fingerprintSnaps.some((snap) => snap.exists)) {
        return NextResponse.json({ success: false, message: "One or more proof files have already been used on another task" }, { status: 409 })
      }
      updates.proofUrl = proofUrls[0]
      updates.proofUrls = proofUrls
      updates.proofHashes = proofHashes
      if (advertiserDecisionStatus === "resubmission_requested" || resubmissionStatus === "pending") {
        updates.resubmissionSubmittedAt = admin.firestore.FieldValue.serverTimestamp()
        updates.resubmissionStatus = "submitted"
        updates.reviewWindowStartedAt = admin.firestore.FieldValue.serverTimestamp()
        updates.advertiserDecisionStatus = "pending"
        updates.status = "Pending"
        updates.reviewedAt = admin.firestore.FieldValue.delete()
        updates.reviewedBy = admin.firestore.FieldValue.delete()
        updates.rejectionReason = admin.firestore.FieldValue.delete()
        updates.finalDecisionAt = admin.firestore.FieldValue.delete()
        updates.finalDecisionBy = admin.firestore.FieldValue.delete()
        updates.finalDecisionSource = admin.firestore.FieldValue.delete()
      }
    }

    if (disputeReason.length > 0) {
      if (status !== "Rejected" && !canOpenForReview && advertiserDecisionStatus !== "resubmission_requested") {
        return NextResponse.json({ success: false, message: "You can only dispute a rejected submission" }, { status: 400 })
      }
      updates.earnerDisputeReason = disputeReason
      updates.earnerDisputeAt = admin.firestore.FieldValue.serverTimestamp()
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, message: "Nothing to update" }, { status: 400 })
    }

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp()
    await submissionRef.set(updates, { merge: true })

    if (proofHashes.length > 0) {
      const now = admin.firestore.FieldValue.serverTimestamp()
      for (const proofHash of proofHashes as string[]) {
        await dbAdmin.collection("proofFingerprints").doc(proofHash).set({
          proofHash,
          userId: decoded.uid,
          submissionId: id,
          createdAt: now,
        }, { merge: true })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Earner submission update error:", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to update submission" },
      { status: 500 }
    )
  }
}
