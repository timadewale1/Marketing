// usuf.ts - Service for Usuf data purchase integration
import type { UsufNetwork } from './usufPlans';

export interface UsufBuyDataResponse {
  status: boolean;
  message: string;
  data?: {
    reference: string;
    amount: number;
    network: string;
    phone: string;
    plan_id: number;
    timestamp: string;
  };
  apiResponse?: Record<string, unknown>;
}

export async function buyUsufData(
  mobileNumber: string,
  network: UsufNetwork,
  planId: number,
  portedNumber: boolean = true,
  options?: { idToken?: string; sellAmount?: number }
): Promise<UsufBuyDataResponse> {
  try {
    const payload = {
      network,
      mobile_number: mobileNumber,
      plan: planId,
      Ported_number: portedNumber,
      ...(options?.idToken && { payFromWallet: true, sellAmount: options.sellAmount }),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (options?.idToken) {
      headers['Authorization'] = `Bearer ${options.idToken}`;
    }

    const response = await fetch('/api/usuf/buy-data', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        status: false,
        message: data?.message || 'Failed to purchase data',
        apiResponse: data,
      };
    }

    return {
      status: data.status || false,
      message: data.message || 'Data purchase successful',
      data: data.data,
      apiResponse: data,
    };
  } catch (error) {
    console.error('Usuf purchase error:', error);
    return {
      status: false,
      message: error instanceof Error ? error.message : 'Network error',
    };
  }
}
