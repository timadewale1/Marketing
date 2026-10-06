import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/admin-session"

type WithdrawalSource = "earner" | "advertiser" | "vendor" | "customer"

export async function POST(req: Request) {
  const adminSession = await requireAdminSession()
  if ("errorResponse" in adminSession) {
    return adminSession.errorResponse as Response
  }

  try {
    const body = await req.json().catch(() => ({}))
    const withdrawalId = String(body?.withdrawalId || "").trim()
    const source = String(body?.source || "").trim() as WithdrawalSource
    const functionUrl = String(process.env.MONNIFY_PAYOUT_FUNCTION_URL || "").trim()
    const functionSecret = String(process.env.API_INTERNAL_SECRET || "").trim()

    if (!withdrawalId || !["earner", "advertiser", "vendor", "customer"].includes(source)) {
      return NextResponse.json({ success: false, message: "Missing withdrawal details" }, { status: 400 })
    }
    if (!functionUrl || !functionSecret) {
      console.error("[admin][withdrawals][approve] payout function configuration is missing")
      return NextResponse.json({ success: false, message: "Payout service is not configured" }, { status: 503 })
    }

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${functionSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        withdrawalId,
        source,
        approvedBy: adminSession.email,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    console.error("[admin][withdrawals][approve] function request failed", error)
    return NextResponse.json(
      { success: false, message: "Could not reach the payout service" },
      { status: 502 }
    )
  }
}