'use client';

import { VoiceProvider } from '@/providers/voice-provider';
import { StudioDraftProvider } from '@/contexts/StudioDraftContext';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import type { ReactNode } from 'react';

export default function WidgetProviders({
  children,
  tenantId,
}: {
  children: ReactNode;
  tenantId: string;
}) {
  const supabase = createSupabaseClient();
  const authContext = { userId: 'widget-user', tenantId };

  return (
    <StudioDraftProvider>
      <VoiceProvider
        authContext={authContext}
        supabase={supabase}
        enableGlobalHotkey={false}
        enableAudio={false}
      >
        {children}
      </VoiceProvider>
    </StudioDraftProvider>
  );
}
