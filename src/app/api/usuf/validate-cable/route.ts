import { NextRequest, NextResponse } from 'next/server';

interface ValidationResponse {
  status: boolean;
  message: string;
  data?: Record<string, unknown>;
}

const USUF_API_URL = 'https://www.usufdataservice.com/api/validateiuc';

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
    const smartCardNumber = searchParams.get('smart_card_number');
    const cableName = searchParams.get('cablename');

    if (!smartCardNumber || !cableName) {
      return NextResponse.json(
        { status: false, message: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const queryString =
  `smart_card_number=${encodeURIComponent(smartCardNumber)}` +
  `&cablename=${encodeURIComponent(cableName)}`;
    const url = `${USUF_API_URL}?${queryString}`;

    console.log('🔍 Cable Validation Request:', {
      cableId: cableName,
      smartCardNumber,
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

    const data = await response.json();

    console.log('📊 Usuf Cable Validation Response:', {
      status: response.status,
      statusText: response.statusText,
      data,
      url,
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          status: false,
          message: data?.message || data?.error || `Validation failed`,
          data,
        },
        { status: response.status }
      );
    }

    // Check if Usuf API returned an invalid smart card
    const isInvalid = data?.invalid === true || data?.invalid === 'true';

    if (isInvalid) {
      return NextResponse.json({
        status: false,
        message: data?.name || 'Invalid smart card number',
        data,
      });
    }

    return NextResponse.json({
      status: true,
      message: data?.name || 'Smart card validated successfully',
      data,
    });
  } catch (error) {
    console.error('Cable validation error:', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Network error' },
      { status: 500 }
    );
  }
}
