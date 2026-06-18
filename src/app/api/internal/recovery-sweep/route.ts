import { NextResponse } from "next/server"
import { runRecoverySweep } from "@/lib/recovery-sweep"
import { proxyToBackendIfConfigured } from "@/lib/backend-route-proxy"

export async function GET(request: Request) {
  const proxied = await proxyToBackendIfConfigured("/api/internal/recovery-sweep", request, { internalAuth: true })
  if (proxied) return proxied

  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await runRecoverySweep()
    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Recovery sweep failed",
      },
      { status: 500 }
    )
  }
}
