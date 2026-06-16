import { NextResponse } from "next/server"
import { runFullActivationFlow } from "@/lib/paymentProcessing"

type UserRole = "earner" | "advertiser"

function isAuthorized(request: Request) {
  const cronSecret = String(process.env.CRON_SECRET || "").trim()
  if (!cronSecret) return true
  return request.headers.get("authorization") === `Bearer ${cronSecret}`
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      userId?: string
      reference?: string
      provider?: string
      role?: UserRole
      references?: string[]
      amount?: number
    }

    const userId = String(body.userId || "").trim()
    const reference = String(body.reference || "").trim()
    const provider = String(body.provider || "monnify").trim()
    const role = body.role === "advertiser" ? "advertiser" : body.role === "earner" ? "earner" : undefined
    const references = Array.isArray(body.references)
      ? body.references.map((value) => String(value || "").trim()).filter(Boolean)
      : []
    const amount = Number(body.amount || 2000)

    if (!userId || !reference) {
      return NextResponse.json({ success: false, message: "userId and reference are required" }, { status: 400 })
    }

    const result = await runFullActivationFlow(
      userId,
      reference,
      provider,
      role,
      references,
      amount
    )

    return NextResponse.json({ success: true, result })
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Activation processing failed" },
      { status: 500 }
    )
  }
}
