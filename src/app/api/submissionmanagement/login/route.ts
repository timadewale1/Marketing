import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import {
  setSubmissionManagementSessionCookie,
  validateSubmissionManagementCredentials,
  SUBMISSION_MANAGEMENT_EMAIL,
} from "@/lib/submissionmanagement-session"

const SUBMISSION_MANAGER_UID = "submissionmanagement-admin"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const email = String(body?.email || "")
    const password = String(body?.password || "")

    if (!validateSubmissionManagementCredentials(email, password)) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ message: "Firebase admin unavailable" }, { status: 500 })
    }

    await dbAdmin.collection("admins").doc(SUBMISSION_MANAGER_UID).set(
      {
        email: SUBMISSION_MANAGEMENT_EMAIL,
        loginEmail: SUBMISSION_MANAGEMENT_EMAIL,
        role: "submissionmanagement",
        limitedScopes: ["campaigns", "submissions"],
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    )

    const customToken = await admin.auth().createCustomToken(SUBMISSION_MANAGER_UID, {
      role: "submissionmanagement",
    })

    await setSubmissionManagementSessionCookie()

    return NextResponse.json({
      authenticated: true,
      email: SUBMISSION_MANAGEMENT_EMAIL,
      customToken,
    })
  } catch (error) {
    console.error("Submission management login failed", error)
    return NextResponse.json({ message: "Login failed" }, { status: 500 })
  }
}
