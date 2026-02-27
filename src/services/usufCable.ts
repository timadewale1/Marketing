// usufCable.ts - Usuf Cable/TV subscription services

export const USUF_CABLES = [
  { id: 1, name: "GOTV" },
  { id: 2, name: "DSTV" },
  { id: 3, name: "STARTIME" },
] as const

export function getCableNameById(cableId: UsufCableId): string {
  const cable = USUF_CABLES.find(c => c.id === cableId)
  return cable?.name || String(cableId)
}

export type UsufCableId = typeof USUF_CABLES[number]["id"]

export const USUF_CABLE_PLANS = [
  // GOTV plans
  { id: 2, cableName: "GOTV", cableid: 1, planName: "GOtv Max", amount: 8500 },
  { id: 16, cableName: "GOTV", cableid: 1, planName: "GOtv Jinja", amount: 3900 },
  { id: 17, cableName: "GOTV", cableid: 1, planName: "GOtv Jolli", amount: 5800 },
  { id: 34, cableName: "GOTV", cableid: 1, planName: "GOtv Smallie - Monthly", amount: 1900 },
  { id: 35, cableName: "GOTV", cableid: 1, planName: "GOtv Smallie - Quarterly", amount: 5100 },
  { id: 36, cableName: "GOTV", cableid: 1, planName: "GOtv Smallie - Yearly", amount: 15000 },
  { id: 47, cableName: "GOTV", cableid: 1, planName: "Gotv supa", amount: 11400 },
  { id: 48, cableName: "GOTV", cableid: 1, planName: "GOtv Supa Plus", amount: 16800 },

  // DSTV plans
  { id: 6, cableName: "DSTV", cableid: 2, planName: "DStv Yanga", amount: 6000 },
  { id: 7, cableName: "DSTV", cableid: 2, planName: "DStv Compact", amount: 19000 },
  { id: 8, cableName: "DSTV", cableid: 2, planName: "DStv Compact Plus", amount: 30000 },
  { id: 9, cableName: "DSTV", cableid: 2, planName: "DStv Premium", amount: 44500 },
  { id: 19, cableName: "DSTV", cableid: 2, planName: "DStv Confam", amount: 11000 },
  { id: 20, cableName: "DSTV", cableid: 2, planName: "DStv Padi", amount: 4400 },
  { id: 23, cableName: "DSTV", cableid: 2, planName: "DStv Asia", amount: 12400 },
  { id: 24, cableName: "DSTV", cableid: 2, planName: "DStv Premium French", amount: 69000 },
  { id: 25, cableName: "DSTV", cableid: 2, planName: "DStv Premium Asia", amount: 50500 },
  { id: 26, cableName: "DSTV", cableid: 2, planName: "DStv Confam + ExtraView", amount: 14300 },
  { id: 27, cableName: "DSTV", cableid: 2, planName: "DStv Yanga + ExtraView", amount: 10100 },
  { id: 28, cableName: "DSTV", cableid: 2, planName: "DStv Padi + ExtraView", amount: 8600 },
  { id: 29, cableName: "DSTV", cableid: 2, planName: "DStv Compact + Extra View", amount: 20700 },
  { id: 30, cableName: "DSTV", cableid: 2, planName: "DStv Premium + Extra View", amount: 50500 },
  { id: 31, cableName: "DSTV", cableid: 2, planName: "DStv Compact Plus - Extra View", amount: 36000 },
  { id: 32, cableName: "DSTV", cableid: 2, planName: "DStv HDPVR Access Service", amount: 6000 },
  { id: 33, cableName: "DSTV", cableid: 2, planName: "ExtraView Access", amount: 6000 },

  // STARTIME plans
  { id: 11, cableName: "STARTIME", cableid: 3, planName: "Classic - 6000Naira - 1 Mont", amount: 6000 },
  { id: 12, cableName: "STARTIME", cableid: 3, planName: "Basic - 4,000 Naira - 1 Month", amount: 4000 },
  { id: 13, cableName: "STARTIME", cableid: 3, planName: "Smart - 5,100 Naira - 1 Month", amount: 5100 },
  { id: 14, cableName: "STARTIME", cableid: 3, planName: "Nova - 2100 Naira - 1 Month", amount: 2100 },
  { id: 15, cableName: "STARTIME", cableid: 3, planName: "Super - 8800 Naira - 1 Month", amount: 9800 },
  { id: 37, cableName: "STARTIME", cableid: 3, planName: "Nova - 700 Naira - 1 Week", amount: 700 },
  { id: 38, cableName: "STARTIME", cableid: 3, planName: "Basic - 1400 Naira - 1 Week", amount: 1400 },
  { id: 39, cableName: "STARTIME", cableid: 3, planName: "Smart - 1700 Naira - 1 Week", amount: 1700 },
  { id: 40, cableName: "STARTIME", cableid: 3, planName: "Classic - 2000 Naira - 1 Week", amount: 2000 },
  { id: 41, cableName: "STARTIME", cableid: 3, planName: "Super - 3300 Naira - 1 Week", amount: 3300 },
] as const

export type UsufCablePlanId = typeof USUF_CABLE_PLANS[number]["id"]

export interface UsufCableResponse {
  status: boolean
  message: string
  reference?: string
  transactionId?: string
  apiResponse?: Record<string, unknown>
}

export function getCablePlansByProvider(cableId: UsufCableId) {
  return USUF_CABLE_PLANS.filter((p) => p.cableid === cableId)
}

export async function buyUsufCable(
  cableName: UsufCableId,
  cablePlan: UsufCablePlanId,
  smartCardNumber: string,
  options?: { idToken?: string; sellAmount?: number }
): Promise<UsufCableResponse> {
  try {
    const payload: Record<string, unknown> = {
      cablename: cableName,
      cableplan: cablePlan,
      smart_card_number: smartCardNumber,
    }
    if (options?.idToken) {
      payload.payFromWallet = true;
      payload.sellAmount = options.sellAmount;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (options?.idToken) {
      headers['Authorization'] = `Bearer ${options.idToken}`
    }

    const response = await fetch('/api/usuf/buy-cable', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        status: false,
        message: data?.message || 'Failed to purchase cable',
        apiResponse: data,
      }
    }

    return {
      status: data.status || false,
      message: data.message || 'Cable subscription successful',
      reference: data.reference || data.data?.reference,
      transactionId: data.transactionId || data.data?.transactionId,
      apiResponse: data,
    }
  } catch (error) {
    console.error('Usuf cable purchase error:', error)
    return {
      status: false,
      message: error instanceof Error ? error.message : 'Network error',
    }
  }
}

export async function validateCableSmartCard(
  cableName: UsufCableId,
  smartCardNumber: string
): Promise<{ status: boolean; message: string; data?: Record<string, unknown> }> {
  try {
    const response = await fetch(
      `/api/usuf/validate-cable?smart_card_number=${encodeURIComponent(
        smartCardNumber
      )}&cablename=${encodeURIComponent(String(cableName))}`,
      { method: "GET", headers: { "Content-Type": "application/json" } }
    )

    const raw = await response.json()

    // ✅ normalize so UI always gets the vendor payload
    const payload = (raw?.data ?? raw) as Record<string, unknown>

    const status = response.ok && raw?.status !== false
    const message =
      raw?.message || (status ? "Smart card validated successfully" : "Smart card validation failed")

    return { status, message, data: payload }
  } catch (error) {
    console.error("Cable validation error:", error)
    return {
      status: false,
      message: error instanceof Error ? error.message : "Network error",
    }
  }
}
