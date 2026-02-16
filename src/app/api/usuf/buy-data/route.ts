import { NextRequest, NextResponse } from 'next/server';
import type { UsufNetwork } from '@/services/usufPlans';

export interface UsufBuyDataRequest {
  network: UsufNetwork;
  mobile_number: string;
  plan: number;
  Ported_number: boolean;
}

export interface UsufBuyDataResponse {
  status: boolean;
  message: string;
  data?: Record<string, unknown>;
}

const USUF_API_URL = 'https://www.usufdataservice.com/api/data/';

export async function POST(request: NextRequest): Promise<NextResponse<UsufBuyDataResponse>> {
  try {
    const authToken = process.env.USUF_AUTH_TOKEN;

    if (!authToken) {
      return NextResponse.json(
        {
          status: false,
          message: 'Usuf API not configured',
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { network, mobile_number, plan, Ported_number } = body;

    // Validate required fields
    if (!network || !mobile_number || !plan) {
      return NextResponse.json(
        {
          status: false,
          message: 'Missing required fields',
        },
        { status: 400 }
      );
    }

    const payload: UsufBuyDataRequest = {
      network,
      mobile_number,
      plan,
      Ported_number: Ported_number ?? true,
    };

    const response = await fetch(USUF_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    console.log('Usuf API Response:', {
      status: response.status,
      statusText: response.statusText,
      data,
      payload,
    });

    // Determine success: accept HTTP OK/Created or vendor-specific success flag
    const vendorSuccess = Boolean(response.ok) || String(data?.Status || data?.status || '').toLowerCase() === 'successful' || String(data?.status || '').toLowerCase() === 'success';

    if (!vendorSuccess) {
      return NextResponse.json(
        {
          status: false,
          message: data?.message || data?.error || `API returned ${response.status}`,
          apiResponse: data,
        },
        { status: response.status }
      );
    }

    // Normalize returned payload for client consumption
    const returnData = data?.data ?? data;
    const message = data?.message || data?.api_response || data?.apiResponse || (returnData && (returnData.api_response || returnData.api_response_message)) || 'Data purchase successful';

    return NextResponse.json({
      status: true,
      message,
      data: returnData,
    });
  } catch (error) {
    console.error('Usuf API error:', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Network error',
      },
      { status: 500 }
    );
  }
}
