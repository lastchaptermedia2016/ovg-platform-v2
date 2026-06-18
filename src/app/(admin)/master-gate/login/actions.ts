'use server'

import { createAuthClient } from '@/lib/auth/server'

export interface AdminLoginResult {
  success: boolean
  error?: string
}

export async function adminLoginAction(formData: FormData): Promise<AdminLoginResult> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { success: false, error: 'Email and password are required' }
  }

  const supabase = await createAuthClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.user) {
    return { success: false, error: error?.message ?? 'Invalid credentials' }
  }

  if (data.user.app_metadata?.role !== 'super_admin') {
    await supabase.auth.signOut()
    return { success: false, error: 'Unauthorized: Super admin access required' }
  }

  return { success: true }
}