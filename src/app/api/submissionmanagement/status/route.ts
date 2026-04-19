import { NextResponse } from "next/server"
import { requireSubmissionManagementSession } from "@/lib/submissionmanagement-session"

export async function GET() {
  try {
    const session = await requireSubmissionManagementSession()
    return NextResponse.json({ authenticated: true, email: session.email })
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
}
