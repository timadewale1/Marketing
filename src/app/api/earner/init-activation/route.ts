import { NextResponse } from 'next/server';

// This endpoint is deprecated. Activation now uses inline Paystack modal from dashboard.
export async function POST() {
  return NextResponse.json({
    success: false,
    message: 'This endpoint is deprecated. Activation now uses the inline Paystack modal from the dashboard.'
  }, { status: 410 });
}
