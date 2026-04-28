import { createBrowserClient } from "@supabase/ssr";
import { resolveHeadersConstructor } from "@/lib/utils/headers";

export function createClient() {
  const HeadersConstructor = resolveHeadersConstructor();
  
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          'Cache-Control': 'no-cache'
        }
      }
    }
  );
}
