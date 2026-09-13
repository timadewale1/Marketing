import { NextResponse } from 'next/server';

// This endpoint is deprecated. Activation now uses Monnify from the dashboard.
export async function POST() {
  return NextResponse.json({
    success: false,
    message: 'This endpoint is deprecated. Activation now uses Monnify.'
  }, { status: 410 });
}
