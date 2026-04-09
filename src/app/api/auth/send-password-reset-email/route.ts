import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { buildCustomFirebaseActionLink } from "@/lib/firebase-action-links"
import { sendPasswordResetLinkEmail } from "@/lib/mailer"

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string }
    const email = body.email?.trim().toLowerCase()

    if (!email) {
      return NextResponse.json({ success: false, message: "Email is required" }, { status: 400 })
    }

    const { admin } = await initFirebaseAdmin()
    if (!admin) {
      return NextResponse.json({ success: false, message: "Firebase admin unavailable" }, { status: 500 })
    }

    let user
    try {
      user = await admin.auth().getUserByEmail(email)
    } catch {
      return NextResponse.json({
        success: true,
        message: "If this email exists, a reset link has been sent",
      })
    }

    const firebaseLink = await admin.auth().generatePasswordResetLink(email, {
      url: "https://www.pambaadverts.com/auth/sign-in?reset=1",
      handleCodeInApp: false,
    })

    const resetUrl = buildCustomFirebaseActionLink(
      firebaseLink,
      "resetPassword",
      "/auth/sign-in?reset=1"
    )

    await sendPasswordResetLinkEmail({
      email,
      name: user.displayName || undefined,
      resetUrl,
    })

    return NextResponse.json({
      success: true,
      message: "If this email exists, a reset link has been sent",
    })
  } catch (error) {
    console.error("send password reset route error", error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to send reset email",
      },
      { status: 500 }
    )
  }
}
