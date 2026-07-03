import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export interface ResolveClientSlugResult {
  data: string | null;
  error: PostgrestError | Error | null;
}

export async function resolveClientSlug(
  userId: string,
): Promise<ResolveClientSlugResult> {
  const trimmed = userId.trim();

  if (!trimmed) {
    return { data: null, error: new Error('Empty userId passed to resolveClientSlug') };
  }

  const supabase = createClient();

  // 1. Get the reseller_id from the mapping table
  const { data: userResellerData, error: userResellerError } = await supabase
    .from('user_resellers')
    .select('reseller_id')
    .eq('user_id', trimmed)
    .maybeSingle();

  if (userResellerError || !userResellerData) {
    return { data: null, error: userResellerError || new Error('No reseller found') };
  }

  const resellerId = userResellerData.reseller_id;

  // 2. Fetch the slug using the reseller_id
  const { data: resellerData, error: resellerError } = await supabase
    .from('resellers')
    .select('slug')
    .eq('id', resellerId)
    .maybeSingle();

  if (resellerError || !resellerData) {
    return { data: null, error: resellerError || new Error('Reseller record not found') };
  }

  return { data: resellerData.slug, error: null };
}
