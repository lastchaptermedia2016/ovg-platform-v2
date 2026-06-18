import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'

export async function createAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be safely ignored when middleware handles session refresh.
          }
        },
      },
    }
  )
}

export type AuthResult = {
  user: User | null
  userId: string | null
  email: string | null
  error: Error | null
}

export async function getAuthenticatedUser(): Promise<AuthResult> {
  const supabase = await createAuthClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return {
      user: null,
      userId: null,
      email: null,
      error: error || new Error('Unauthorized'),
    }
  }
  return {
    user,
    userId: user.id,
    email: user.email ?? null,
    error: null,
  }
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// Tenant ownership guard - ensures user has access via reseller
export async function validateTenantOwnership(
  userId: string,
  tenantId: string
): Promise<{ resellerId: string } | null> {
  const supabase = await createAuthClient()

  // Get tenant's reseller
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('reseller_id')
    .eq('id', tenantId)
    .single()

  if (tenantError || !tenant?.reseller_id) {
    return null
  }

  // Verify user belongs to that reseller
  const { data: userReseller } = await supabase
    .from('user_resellers')
    .select('reseller_id')
    .eq('user_id', userId)
    .eq('reseller_id', tenant.reseller_id)
    .maybeSingle()

  if (!userReseller) {
    return null
  }

  return { resellerId: tenant.reseller_id }
}