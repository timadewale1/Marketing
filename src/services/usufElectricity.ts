// usufElectricity.ts - Usuf Electricity bill services

export const USUF_DISCOS = [
  { id: 1, name: "Ikeja Electric" },
  { id: 2, name: "Eko Electric" },
  { id: 3, name: "Abuja Electric" },
  { id: 4, name: "Kano Electric" },
  { id: 5, name: "Enugu Electric" },
  { id: 6, name: "Port Harcourt Electric" },
  { id: 8, name: "Kaduna Electric" },
  { id: 9, name: "Jos Electric" },
  { id: 10, name: "Benin Electric" },
  { id: 11, name: "Yola Electric" },
  { id: 12, name: "Ibadan Electric" },
  { id: 13, name: "Aba Electric" },
] as const

export function getDiscoNameById(discoId: UsufDiscoId): string {
  const disco = USUF_DISCOS.find(d => d.id === discoId)
  return disco?.name || String(discoId)
}

export type UsufDiscoId = typeof USUF_DISCOS[number]["id"]

export type MeterType = 1 | 2 // 1 = PREPAID, 2 = POSTPAID

export interface UsufElectricityResponse {
  status: boolean
  message: string
  reference?: string
  transactionId?: string
  apiResponse?: Record<string, unknown>
}

export async function buyUsufElectricity(
  disco: UsufDiscoId,
  amount: number,
  meterNumber: string,
  meterType: MeterType,
  options?: { idToken?: string; sellAmount?: number }
): Promise<UsufElectricityResponse> {
  try {
    const payload: Record<string, unknown> = {
      disco_name: disco,
      amount,
      meter_number: meterNumber,
      MeterType: meterType,
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

    const response = await fetch('/api/usuf/buy-electricity', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        status: false,
        message: data?.message || 'Failed to purchase electricity',
        apiResponse: data,
      }
    }

    return {
      status: data.status || false,
      message: data.message || 'Electricity payment successful',
      reference: data.reference || data.data?.reference,
      transactionId: data.transactionId || data.data?.transactionId,
      apiResponse: data,
    }
  } catch (error) {
    console.error('Usuf electricity purchase error:', error)
    return {
      status: false,
      message: error instanceof Error ? error.message : 'Network error',
    }
  }
}

export async function validateElectricityMeter(
  disco: UsufDiscoId,
  meterNumber: string,
  meterType: MeterType
): Promise<{ status: boolean; message: string; data?: Record<string, unknown> }> {
  try {
    const response = await fetch(
      `/api/usuf/validate-meter?meternumber=${encodeURIComponent(meterNumber)}&disconame=${disco}&mtype=${meterType}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    )

    const data = await response.json()

    const status = response.ok && data.status !== false
    const message = data?.message || (status ? 'Meter validated successfully' : 'Meter validation failed')

    return {
      status,
      message,
      data,
    }
  } catch (error) {
    console.error('Meter validation error:', error)
    return {
      status: false,
      message: error instanceof Error ? error.message : 'Network error',
    }
  }
}
