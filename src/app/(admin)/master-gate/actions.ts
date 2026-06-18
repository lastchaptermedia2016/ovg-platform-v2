'use server'

import { createAuthClient, getAuthenticatedUser } from '@/lib/auth/server'
import { createClient } from '@supabase/supabase-js'
import { PLAN_TIER_COSTS, ADDON_COSTS } from '@/config/pricing'
import type { ResellerRecord } from '@/types/database'

export interface ProvisionResellerInput {
  companyName: string
  slug: string
  email: string
}

export interface ProvisionTenantPricingInput {
  tenantId: string
  planTier: 'standard' | 'premium' | 'enterprise'
  indicators: {
    sms: 'active' | 'inactive'
    signal: 'active' | 'inactive'
  }
  computedRetail: number
}

function sanitizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function provisionResellerAction(input: ProvisionResellerInput): Promise<{
  success: true;
  resellerId: ResellerRecord['id'];
  slug: string;
  owner_email: string;
}> {
  const { user, error: authError } = await getAuthenticatedUser()

  if (authError || !user) {
    throw new Error('Unauthorized')
  }

  if (user.app_metadata?.role !== 'super_admin') {
    throw new Error('Forbidden: Only super admins can provision resellers')
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  const sanitizedSlug = sanitizeSlug(input.slug)

  try {
    const { data: reseller, error: resellerError } = await supabaseAdmin
      .from('resellers')
      .insert({
        company_name: input.companyName,
        slug: sanitizedSlug,
        status: 'active',
        owner_email: input.email,
      })
      .select('id')
      .single()

    if (resellerError || !reseller) {
      if (resellerError?.code === '23505') {
        throw new Error('This slug or owner email is already reserved')
      }
      throw new Error(`Failed to create reseller profile: ${resellerError?.message ?? 'unknown error'}`)
    }

    return {
      success: true,
      resellerId: reseller.id,
      slug: sanitizedSlug,
      owner_email: input.email,
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Failed to create reseller profile: unknown error')
  }
}

export async function provisionTenantPricing(input: ProvisionTenantPricingInput): Promise<{
  success: boolean
  newMrr?: string
  error?: string
}> {
  try {
    // Authenticate using the canonical server utility
    const { userId, error: authError } = await getAuthenticatedUser()
    if (authError || !userId) {
      return { success: false, error: 'Unauthorized' }
    }

    const supabase = await createAuthClient()

    // Double-lock ownership verification
    const { data: ownership } = await supabase
      .from('user_resellers')
      .select('reseller_id')
      .eq('user_id', userId)
      .maybeSingle()

    let resellerId = ownership?.reseller_id ?? null

    if (!resellerId) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('reseller_id')
        .eq('id', input.tenantId)
        .single()
      resellerId = tenant?.reseller_id ?? null
    }

    if (!resellerId) {
      return { success: false, error: 'Forbidden - tenant access denied' }
    }

    // Compute MRR server-side
    const planRetail = PLAN_TIER_COSTS[input.planTier]?.suggestedRetail ?? 0
    const whatsappAddon = input.indicators.sms === 'active' ? ADDON_COSTS.whatsapp.retail : 0
    const signalsAddon = input.indicators.signal === 'active' ? ADDON_COSTS.highVolumeSignals.retail : 0
    const newMrr = String(planRetail + whatsappAddon + signalsAddon)

    // Scoped mutation
    const { error: updateError } = await supabase
      .from('tenants')
      .update({
        plan_tier: input.planTier,
        indicators: input.indicators,
        mrr: newMrr,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.tenantId)
      .eq('reseller_id', resellerId)

    if (updateError) {
      return { success: false, error: 'Database write failed' }
    }

    return { success: true, newMrr }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected error saving pricing',
    }
  }
}
