import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/admin-session"
import monnify from "@/services/monnify"

type StatusResponse = {
  success: boolean
  statuses: Record<string, string>
}

function extractPaymentStatus(payload: Record<string, unknown> | null) {
  const responseBody = payload?.responseBody as Record<string, unknown> | undefined
  const status = String(responseBody?.paymentStatus || responseBody?.status || "").trim()
  return status || "UNKNOWN"
}

export async function POST(req: Request): Promise<Response> {
  try {
    await requireAdminSession()
  } catch {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const references = Array.isArray(body?.references) ? body.references.map((ref: unknown) => String(ref || "").trim()).filter(Boolean) : []
  if (references.length === 0) {
    return NextResponse.json({ success: false, message: "No references provided" }, { status: 400 })
  }

  const statuses: Record<string, string> = {}
  for (const reference of references) {
    if (statuses[reference]) continue
    try {
      const payload = await monnify.verifyTransaction(reference)
      statuses[reference] = extractPaymentStatus(payload as Record<string, unknown> | null)
    } catch (error) {
      console.error("[admin][recovery][status] verify failed", { reference, error })
      statuses[reference] = "UNKNOWN"
    }
  }

  const response: StatusResponse = { success: true, statuses }
  return NextResponse.json(response)
}
