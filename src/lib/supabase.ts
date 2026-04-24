import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("⚠️ Supabase credentials missing. Check your environment variables.");
}

// Singleton instance for server components
export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);

// Cached client instance for client components (singleton pattern)
let clientInstance: ReturnType<typeof createSupabaseClient> | null = null;

// Factory function for client components (returns cached instance)
export function createClient() {
  if (!clientInstance) {
    clientInstance = createSupabaseClient(supabaseUrl, supabaseAnonKey);
  }
  return clientInstance;
}