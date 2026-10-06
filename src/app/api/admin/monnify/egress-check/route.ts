import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/admin-session"

export async function POST() {
  const adminSession = await requireAdminSession()
  if ("errorResponse" in adminSession) {
    return adminSession.errorResponse as Response
  }

  const functionUrl = String(process.env.MONNIFY_PAYOUT_FUNCTION_URL || "").trim()
  const functionSecret = String(process.env.API_INTERNAL_SECRET || "").trim()
  if (!functionUrl || !functionSecret) {
    return NextResponse.json({ success: false, message: "Payout service is not configured" }, { status: 503 })
  }

  try {
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${functionSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "check-egress-ip" }),
    })
    const payload = await response.json().catch(() => ({}))
    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    console.error("[admin][monnify][egress-check] function request failed", error)
    return NextResponse.json({ success: false, message: "Could not reach the payout service" }, { status: 502 })
  }
}