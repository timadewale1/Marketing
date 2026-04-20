import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import {
  getSubmissionManagementConfig,
  setSubmissionManagementSessionCookie,
  validateSubmissionManagementCredentials,
} from "@/lib/submissionmanagement-session"

const SUBMISSION_MANAGER_UID = "submissionmanagement-admin"

export async function POST(req: Request) {
  try {
    const { configured, email: configuredEmail } = getSubmissionManagementConfig()
    if (!configured) {
      return NextResponse.json({ message: "Submission management credentials are not configured" }, { status: 500 })
    }

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
        email: configuredEmail,
        loginEmail: configuredEmail,
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
      email: configuredEmail,
      customToken,
    })
  } catch (error) {
    console.error("Submission management login failed", error)
    return NextResponse.json({ message: "Login failed" }, { status: 500 })
  }
}
