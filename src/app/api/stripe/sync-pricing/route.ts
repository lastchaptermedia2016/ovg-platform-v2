import { NextRequest, NextResponse } from 'next/server';
import { syncResellerTiers, updateResellerPricing } from '@/lib/services/stripe-prices';

/**
 * Stripe Pricing Sync API Route
 * 
 * This route handles syncing pricing tiers to Stripe for a Reseller.
 * It creates products and prices on the Reseller's connected Stripe account
 * and updates the resellers table with the resulting price IDs.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { resellerId, stripeConnectId, tierPricing } = body;

    if (!resellerId || !stripeConnectId || !tierPricing) {
      return NextResponse.json(
        { error: 'Missing required fields: resellerId, stripeConnectId, tierPricing' },
        { status: 400 }
      );
    }

    // Sync pricing tiers to Stripe
    const priceIds = await syncResellerTiers(stripeConnectId, tierPricing);

    // Update resellers table with new price IDs
    await updateResellerPricing(resellerId, priceIds);

    return NextResponse.json({
      success: true,
      priceIds,
    });
  } catch (error) {
    console.error('Stripe pricing sync error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync pricing' },
      { status: 500 }
    );
  }
}
