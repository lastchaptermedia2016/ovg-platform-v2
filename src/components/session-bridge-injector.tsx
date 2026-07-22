import { createClient } from '@/lib/supabase/server';

export async function SessionBridgeInjector() {
  let sessionPayload: {
    access_token: string;
    refresh_token: string;
    expires_at: number | undefined;
  } | null = null;

  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      sessionPayload = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
      };
    }
  } catch {
    // no-op: leave payload null when no session is available
  }

  if (!sessionPayload) {
    return null;
  }

  return (
    <script
      id="session-bridge"
      type="application/json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(sessionPayload),
      }}
    />
  );
}
