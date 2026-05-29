// Canonical re-exports — no singleton references
export { createClient } from './server';
export { createClient as createBrowserClient } from './client';
export { supabaseAdmin } from './admin';