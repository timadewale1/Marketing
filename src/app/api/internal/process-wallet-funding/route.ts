import { NextResponse } from "next/server"
import { processWalletFundingWithRetry } from "@/lib/paymentProcessing"
import { proxyToBackendIfConfigured } from "@/lib/backend-route-proxy"

function isAuthorized(request: Request) {
  const cronSecret = String(process.env.CRON_SECRET || "").trim()
  if (!cronSecret) return true
  return request.headers.get("authorization") === `Bearer ${cronSecret}`
}

export async function POST(request: Request) {
  const proxied = await proxyToBackendIfConfigured("/api/internal/process-wallet-funding", request, { internalAuth: true })
  if (proxied) return proxied

  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      userId?: string
      reference?: string
      amount?: number
      provider?: string
      role?: "advertiser" | "earner"
      references?: string[]
    }

    const userId = String(body.userId || "").trim()
    const reference = String(body.reference || "").trim()
    const provider = String(body.provider || "monnify").trim()
    const amount = Number(body.amount || 0)
    const role = body.role === "earner" ? "earner" : "advertiser"
    const references = Array.isArray(body.references)
      ? body.references.map((value) => String(value || "").trim()).filter(Boolean)
      : []

    if (!userId || !reference || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, message: "userId, reference, and a valid amount are required" },
        { status: 400 }
      )
    }

    const result = await processWalletFundingWithRetry(
      userId,
      reference,
      amount,
      provider,
      role,
      3,
      references
    )

    return NextResponse.json({ success: true, result })
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Wallet funding processing failed" },
      { status: 500 }
    )
  }
}
