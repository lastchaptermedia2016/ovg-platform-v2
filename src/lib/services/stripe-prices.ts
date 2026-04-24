import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
});

interface TierPricing {
  basic: number;
  pro: number;
  enterprise: number;
}

/**
 * syncResellerTiers - Create Stripe products and prices for a Reseller's pricing tiers
 * 
 * This function creates products and recurring prices on the Reseller's connected Stripe account
 * using the Stripe-Account header to ensure proper account isolation.
 * 
 * @param stripeConnectId - The Stripe Connect account ID from the resellers table
 * @param tierPricing - Object containing pricing for Basic, Pro, and Enterprise tiers
 * @returns Object mapping tier names to their Stripe price IDs
 */
export async function syncResellerTiers(
  stripeConnectId: string,
  tierPricing: TierPricing
): Promise<Record<string, string>> {
  const priceIds: Record<string, string> = {};

  // Create products and prices for each tier
  for (const [tier, price] of Object.entries(tierPricing)) {
    try {
      // Create product on the Reseller's connected account
      const product = await stripe.products.create(
        {
          name: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan`,
          description: `${tier.charAt(0).toUpperCase() + tier.slice(1)} subscription plan`,
        },
        {
          stripeAccount: stripeConnectId,
        }
      );

      // Create recurring price (monthly) for the product
      const priceObj = await stripe.prices.create(
        {
          product: product.id,
          unit_amount: price * 100, // Convert to cents
          currency: 'usd',
          recurring: {
            interval: 'month',
          },
        },
        {
          stripeAccount: stripeConnectId,
        }
      );

      priceIds[tier] = priceObj.id;
    } catch (error) {
      console.error(`Failed to create ${tier} tier:`, error);
      throw new Error(`Failed to create ${tier} tier: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return priceIds;
}

/**
 * updateResellerPricing - Update the resellers table with new pricing tier IDs
 * 
 * @param resellerId - The UUID of the reseller
 * @param priceIds - Object mapping tier names to Stripe price IDs
 */
export async function updateResellerPricing(
  resellerId: string,
  priceIds: Record<string, string>
): Promise<void> {
  const { supabase } = await import('@/lib/supabase');

  const { error } = await supabase
    .from('resellers')
    .update({
      pricing_tiers: priceIds,
    })
    .eq('id', resellerId);

  if (error) {
    throw new Error(`Failed to update reseller pricing: ${error.message}`);
  }
}

/**
 * getResellerPricing - Fetch current pricing tiers from the resellers table
 * 
 * @param resellerId - The UUID of the reseller
 * @returns The pricing tiers object
 */
export async function getResellerPricing(resellerId: string) {
  const { supabase } = await import('@/lib/supabase');

  const { data, error } = await supabase
    .from('resellers')
    .select('pricing_tiers')
    .eq('id', resellerId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch reseller pricing: ${error.message}`);
  }

  return data?.pricing_tiers || {};
}
