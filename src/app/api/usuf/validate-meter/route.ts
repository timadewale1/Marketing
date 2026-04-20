import { NextRequest, NextResponse } from 'next/server';

interface ValidationResponse {
  status: boolean;
  message: string;
  data?: {
    invalid?: boolean | string;
    name?: string;
    address?: string;
    [key: string]: unknown;
  };
}

const USUF_API_URL = 'https://www.usufdataservice.com/api/validatemeter';

export async function GET(request: NextRequest): Promise<NextResponse<ValidationResponse>> {
  try {
    const authToken = process.env.USUF_AUTH_TOKEN;

    if (!authToken) {
      return NextResponse.json(
        { status: false, message: 'Usuf API not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const meterNumber = searchParams.get('meternumber');
    const discoName = searchParams.get('disconame');
    const meterType = searchParams.get('mtype');

    if (!meterNumber || !discoName || !meterType) {
      return NextResponse.json(
        { status: false, message: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const queryString =
  `meternumber=${encodeURIComponent(meterNumber)}` +
  `&disconame=${encodeURIComponent(discoName)}` +
  `&mtype=${encodeURIComponent(meterType)}`;
    const url = `${USUF_API_URL}?${queryString}`;

    console.log('🔍 Meter Validation Request:', {
      discoId: discoName,
      meterNumber,
      meterType,
      url,
    });

    // Create abort controller with 30 second timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 30000);

    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${authToken}`,
          'Content-Type': 'application/json',
        },
        signal: abortController.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const rawData = await response.json();
    const normalizedData = {
      ...(rawData || {}),
      invalid: rawData?.invalid,
      name: rawData?.data?.name || rawData?.name,
      address: rawData?.data?.address || rawData?.address,
    };

    console.log('📊 Usuf Meter Validation Response:', {
      status: response.status,
      statusText: response.statusText,
      data: rawData,
      url,
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          status: false,
          message: normalizedData?.message || normalizedData?.error || `Validation failed`,
          data: normalizedData,
        },
        { status: response.status }
      );
    }

    // Check if Usuf API returned an invalid meter
    const isInvalid = normalizedData?.invalid === true || normalizedData?.invalid === 'true';

    if (isInvalid) {
      return NextResponse.json({
        status: false,
        message: normalizedData?.name || 'Invalid meter number',
        data: normalizedData,
      });
    }

    return NextResponse.json({
      status: true,
      message: normalizedData?.name || 'Meter validated successfully',
      data: normalizedData,
    });
  } catch (error) {
    console.error('Meter validation error:', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Network error' },
      { status: 500 }
    );
  }
}
