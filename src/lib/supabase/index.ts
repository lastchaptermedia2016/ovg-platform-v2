import { supabaseAdmin } from './admin';

export { createClient } from './server';
export { createClient as createBrowserClient } from './client';
export { supabaseAdmin };
// Provide stable `supabase` name for existing imports that expect it.
export { supabaseAdmin as supabase };