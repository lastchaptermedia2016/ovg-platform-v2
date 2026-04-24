import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
});

/**
 * createConnectAccount - Initialize a Stripe Connect account for a Reseller
 * 
 * @param resellerId - The UUID of the reseller
 * @param resellerEmail - The email of the reseller
 * @returns The Stripe Connect account ID
 */
export async function createConnectAccount(
  resellerId: string,
  resellerEmail: string
): Promise<string> {
  const account = await stripe.accounts.create({
    type: 'express',
    country: 'US',
    email: resellerEmail,
    capabilities: {
      transfers: { requested: true },
      card_payments: { requested: true },
    },
    business_type: 'individual',
    business_profile: {
      url: `${process.env.NEXT_PUBLIC_SITE_URL}/reseller/${resellerId}`,
    },
  });

  return account.id;
}

/**
 * getOnboardingLink - Generate the URL for the Reseller to set up their bank info
 * 
 * @param stripeConnectId - The Stripe Connect account ID from the resellers table
 * @param resellerId - The UUID of the reseller (for return URL)
 * @returns The onboarding URL
 */
export async function getOnboardingLink(
  stripeConnectId: string,
  resellerId: string
): Promise<string> {
  const accountLink = await stripe.accountLinks.create({
    account: stripeConnectId,
    refresh_url: `${process.env.NEXT_PUBLIC_SITE_URL}/reseller/dashboard?tab=payments`,
    return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/stripe/connect?reseller_id=${resellerId}`,
    type: 'account_onboarding',
  });

  return accountLink.url;
}

/**
 * getAccountDetails - Fetch Stripe Connect account details
 * 
 * @param stripeConnectId - The Stripe Connect account ID
 * @returns The account details including onboarding status
 */
export async function getAccountDetails(stripeConnectId: string) {
  const account = await stripe.accounts.retrieve(stripeConnectId);
  return account;
}

/**
 * createLoginLink - Generate a login link for the reseller to access their Stripe dashboard
 * 
 * @param stripeConnectId - The Stripe Connect account ID
 * @returns The login URL
 */
export async function createLoginLink(stripeConnectId: string): Promise<string> {
  const loginLink = await stripe.accounts.createLoginLink(stripeConnectId);
  return loginLink.url;
}
