// usufAirtime.ts - Usuf Airtime services

export type UsufNetwork = 1 | 2 | 3 | 4 | 5

export const USUF_NETWORKS: Record<UsufNetwork, string> = {
  1: "MTN",
  2: "GLO",
  3: "9MOBILE",
  4: "AIRTEL",
  5: "SMILE",
}

export interface UsufAirtimeResponse {
  status: boolean
  message: string
  reference?: string
  transactionId?: string
  apiResponse?: Record<string, unknown>
}

export async function buyUsufAirtime(
  network: UsufNetwork,
  amount: number,
  phone: string,
  portedNumber: boolean = true,
  options?: { idToken?: string }
): Promise<UsufAirtimeResponse> {
  try {
    const payload = {
      network,
      amount,
      mobile_number: phone,
      Ported_number: portedNumber,
      airtime_type: "VTU",
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (options?.idToken) {
      headers['Authorization'] = `Bearer ${options.idToken}`
    }

    const response = await fetch('/api/usuf/buy-airtime', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        status: false,
        message: data?.message || 'Failed to purchase airtime',
        apiResponse: data,
      }
    }

    return {
      status: data.status || false,
      message: data.message || 'Airtime purchase successful',
      reference: data.reference || data.data?.reference,
      transactionId: data.transactionId || data.data?.transactionId,
      apiResponse: data,
    }
  } catch (error) {
    console.error('Usuf airtime purchase error:', error)
    return {
      status: false,
      message: error instanceof Error ? error.message : 'Network error',
    }
  }
}
