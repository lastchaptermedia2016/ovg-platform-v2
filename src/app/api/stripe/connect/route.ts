import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Stripe Connect Callback Handler
 * 
 * This route handles the callback from Stripe after the reseller completes onboarding.
 * It updates the resellers table to mark onboarding as complete.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const resellerId = searchParams.get('reseller_id');

  if (!resellerId) {
    return NextResponse.json({ error: 'Missing reseller_id' }, { status: 400 });
  }

  try {
    // Update the resellers table to mark onboarding as complete
    const { error } = await supabase
      .from('resellers')
      .update({ stripe_onboarding_complete: true })
      .eq('id', resellerId);

    if (error) {
      console.error('Failed to update reseller onboarding status:', error);
      return NextResponse.json({ error: 'Failed to update onboarding status' }, { status: 500 });
    }

    // Redirect to the dashboard with success message
    return NextResponse.redirect(new URL('/reseller/dashboard?tab=payments&success=true', request.url));
  } catch (error) {
    console.error('Stripe callback error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
