import { createClient as createServerClient } from "./server";
import { createClient as createBrowserClient } from "./client";
import { supabaseAdmin } from "./admin";

// Production Excellence: Supabase Singleton Pattern
// Prevents redundant connection overhead and ensures consistent client usage

class SupabaseSingleton {
  private static serverInstance: Awaited<ReturnType<typeof createServerClient>> | null = null;
  private static browserInstance: ReturnType<typeof createBrowserClient> | null = null;

  // Server-side singleton with proper cookie handling
  static async getServerClient() {
    if (!this.serverInstance) {
      this.serverInstance = await createServerClient();
    }
    return this.serverInstance;
  }

  // Browser-side singleton
  static getBrowserClient() {
    if (!this.browserInstance) {
      this.browserInstance = createBrowserClient();
    }
    return this.browserInstance;
  }

  // Service role client (always fresh for security)
  static getAdminClient() {
    return supabaseAdmin;
  }

  // Reset server instance (useful for testing or middleware)
  static resetServerInstance() {
    this.serverInstance = null;
  }
}

// Export convenient aliases
export const supabase = SupabaseSingleton;
export const getServerClient = () => SupabaseSingleton.getServerClient();
export const getBrowserClient = () => SupabaseSingleton.getBrowserClient();
export const getAdminClient = () => SupabaseSingleton.getAdminClient();

// Legacy exports for backward compatibility
export { createClient as createServerClient } from "./server";
export { createClient as createBrowserClient } from "./client";
export { supabaseAdmin };
