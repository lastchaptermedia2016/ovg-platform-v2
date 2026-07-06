'use client';

import { useEffect, useRef } from 'react';
import { useVoiceColleague, useVoiceState } from '@/providers/voice-provider';
import type { UiTrigger } from '@/lib/ai/cognitive-orchestrator';

/**
 * Listens for a UI trigger raised by the CognitiveOrchestrator and opens the
 * capabilities surface. This is the "Resident Intelligence" side: the AI only
 * emits the signal; this component decides *when* to act.
 *
 * UX guard: we never pop the modal aggressively while the user is mid-task
 * (listening or processing), so a stray "what can you do" during a delicate
 * action won't interrupt them.
 */
export function CapabilitiesBridge({ onOpen }: { onOpen: (trigger: UiTrigger) => void }) {
  const { uiTrigger } = useVoiceColleague();
  const { status } = useVoiceState();
  const lastTriggerRef = useRef<UiTrigger | null>(null);

  useEffect(() => {
    if (!uiTrigger) {
      lastTriggerRef.current = null;
      return;
    }
    if (uiTrigger === lastTriggerRef.current) return;
    lastTriggerRef.current = uiTrigger;
    // Soft guard: don't interrupt an in-flight voice task.
    if (status === 'listening' || status === 'processing') return;
    onOpen(uiTrigger);
  }, [uiTrigger, status, onOpen]);

  return null;
}
