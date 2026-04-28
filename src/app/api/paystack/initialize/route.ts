import { NextRequest, NextResponse } from 'next/server';
import { initializeTransaction } from '@/core/billing/paystack';

export const dynamic = 'force-dynamic';

/**
 * Paystack Transaction Initialization API Route
 * 
 * This route handles initializing a Paystack transaction for payment processing.
 * It receives payment details and returns a Paystack authorization URL.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, amount, reference, callback_url, metadata } = body;

    if (!email || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: email, amount' },
        { status: 400 }
      );
    }

    // Initialize Paystack transaction
    const result = await initializeTransaction({
      email,
      amount: amount * 100, // Convert to kobo (smallest currency unit)
      reference,
      callback_url: callback_url || `${process.env.NEXT_PUBLIC_SITE_URL}/payment/success`,
      metadata,
    });

    return NextResponse.json({
      success: true,
      authorization_url: result.data.authorization_url,
      reference: result.data.reference,
    });
  } catch (error) {
    console.error('Paystack initialization error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initialize transaction' },
      { status: 500 }
    );
  }
}
