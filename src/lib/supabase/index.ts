import { supabaseAdmin } from './admin';

// Production Excellence: Export singleton pattern for enterprise-grade architecture
export { supabase as supabaseSingleton, getServerClient, getBrowserClient, getAdminClient } from './singleton';

// Legacy exports for backward compatibility
export { createClient } from './server';
export { createClient as createBrowserClient } from './client';
export { supabaseAdmin };

// Provide stable `supabase` name for existing imports that expect it
export { supabaseAdmin as supabase };