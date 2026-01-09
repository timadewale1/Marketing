import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const pathname = url.pathname || ''
    // strip prefix '/api/paystack-mock/'
    const path = pathname.replace(/^\/api\/paystack-mock\/?/, '')
    const body = await req.json().catch(() => ({}))

    if (path === 'transferrecipient') {
      return NextResponse.json({
        status: true,
        message: 'Recipient created',
        data: { recipient_code: 'RCP_MOCK_12345' },
      })
    }

    if (path === 'transfer') {
      return NextResponse.json({
        status: true,
        message: 'Transfer queued',
        data: {
          id: 'TRF_MOCK_12345',
          reference: 'REF_MOCK_12345',
          status: 'success',
        },
      })
    }

    return NextResponse.json({ status: false, message: 'Not implemented in mock', path }, { status: 404 })
  } catch (e) {
    console.error('Mock paystack error', e)
    return NextResponse.json({ status: false, message: 'Server error' }, { status: 500 })
  }
}
