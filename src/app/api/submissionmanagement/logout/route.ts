import { NextResponse } from "next/server"
import { clearSubmissionManagementSessionCookie } from "@/lib/submissionmanagement-session"

export async function POST() {
  await clearSubmissionManagementSessionCookie()
  return NextResponse.json({ success: true })
}
