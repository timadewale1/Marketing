import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { buildCustomFirebaseActionLink } from "@/lib/firebase-action-links"
import { sendVerificationEmail } from "@/lib/mailer"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.pambaadverts.com"

export async function POST(req: Request) {
  try {
    const authorization = req.headers.get("authorization") || ""
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : ""
    if (!token) {
      return NextResponse.json({ success: false, message: "Missing authorization token" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({})) as { name?: string }
    const { admin } = await initFirebaseAdmin()
    if (!admin) {
      return NextResponse.json({ success: false, message: "Firebase admin unavailable" }, { status: 500 })
    }

    const decoded = await admin.auth().verifyIdToken(token)
    const user = await admin.auth().getUser(decoded.uid)
    if (!user.email) {
      return NextResponse.json({ success: false, message: "No email found for this account" }, { status: 400 })
    }

    const firebaseLink = await admin.auth().generateEmailVerificationLink(user.email, {
      url: `${APP_URL}/auth/sign-in?verified=1`,
      handleCodeInApp: false,
    })
    const verificationUrl = buildCustomFirebaseActionLink(
      firebaseLink,
      "verifyEmail",
      "/auth/sign-in?verified=1"
    )

    await sendVerificationEmail({
      email: user.email,
      name: body.name || user.displayName || undefined,
      verificationUrl,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("send verification email route error", error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to send verification email",
      },
      { status: 500 }
    )
  }
}
