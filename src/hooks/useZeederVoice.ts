/**
 * @file useZeederVoice.ts
 *
 * ZEEDER Voice-Action Bridge Hook (Client-Surface)
 *
 * Connects the ZEEDER client-side state machine (`ZeederContext`) with the
 * surface-isolated `/api/client/process-command` endpoint. When a user speaks
 * a command, `handleVoiceCommand` sends it to the client endpoint which
 * resolves the intent, then maps the response `actionType` to a
 * `ZeederActionId` and calls `ZeederContext.dispatch()`.
 *
 * Voice capture uses a high-fidelity pipeline:
 *   1. `startListening()` opens the mic via `MediaRecorder` (15s cap).
 *   2. The blob is transcoded to WAV and POSTed to `/api/client/stt`
 *      (Groq Whisper, server-side, tenant-scoped vocabulary boost).
 *   3. On any failure it transparently falls back to the device Web Speech
 *      API (`webkitSpeechRecognition`) with a `sttFallback` indicator.
 *
 * @remarks
 * This hook is intentionally **zero-dependency** with respect to the
 * reseller domain. It does NOT import from:
 * - `src/contexts/HannahContext`
 * - `src/hooks/use-voice-command`
 * - `src/lib/reseller/*`
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useZeeder, type ZeederClientProfile } from '@/contexts/ZeederContext';
import { useStudioDraft } from '@/contexts/StudioDraftContext';
import { isZeederActionId, type ZeederActionId } from '@/lib/zeeder/action-registry';
import type { CanonicalBranding } from '@/lib/schemas/tenant-config.canonical';
import { markVoiceNavigation } from '@/lib/voice/voiceNavSignal';
import { transcodeBlobToWav } from '@/utils/audio/transcode-to-wav';
import { getSpeechRecognition } from '@/types/voice-parser';
import { useVoiceState } from '@/providers/voice-provider';

/**
 * Normalizes text so TTS engines pronounce South African Rands (ZAR) naturally.
 * Converts patterns like "R3,250", "R3 250", or "R39" into "[Number] Rands" for smooth speech synthesis.
 */
export function normalizeTextForTTS(text: string): string {
  if (!text) return "";
  return text
    .replace(/\bR\s?(\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?)\b/g, (match, numberGroup) => {
      // Strip any thousands formatting commas or spaces
      const cleanNumber = numberGroup.replace(/[,\s]/g, "");
      return `${cleanNumber} Rands`;
    })
    .replace(/R(\d+)/g, "$1 Rands");
}

// ──────────────────────────── Types ─────────────────────────────────────

/** Internal state for the voice bridge. */
interface ZeederVoiceState {
  /** Whether a command is currently being processed (API + dispatch). */
  isProcessing: boolean;
  /** The last error message, or null if no error. */
  error: string | null;
}

/**
 * Map from `/api/client/process-command` `actionType` values to ZEEDER action IDs.
 *
 * Entries not in this map (e.g. `SYSTEM_HELP`, `CLIENT_NOP`) are treated as
 * conversational/successful responses that don't trigger a ZEEDER dispatch —
 * they just log and reset state without error.
 */
const ACTION_TYPE_TO_ZEEDER_ID: Record<string, ZeederActionId | null> = {
  SYSTEM_UPDATE_BRANDING: 'updateBranding',
  SYSTEM_TELEMETRY: 'fetchTelemetry',
};

/** Hard ceiling on a single push-to-talk capture (15s). */
const MAX_RECORDING_MS = 15_000;

// ──────────────────────────── Helpers ────────────────────────────────────

/**
 * Wait for the client profile to hydrate before issuing a command.
 *
 * @param ref - Live reference to the current `ZeederClientProfile`.
 * @param timeoutMs - Maximum time to poll before giving up.
 * @returns The hydrated profile, or null if it never arrived.
 */
async function pollForProfile(
  ref: React.RefObject<ZeederClientProfile | null>,
  timeoutMs: number,
): Promise<ZeederClientProfile | null> {
  const intervalMs = 150;
  let waited = 0;
  while (waited < timeoutMs) {
    if (ref.current) return ref.current;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    waited += intervalMs;
  }
  return ref.current;
}

// ──────────────────────────── Hook ──────────────────────────────────────

/**
 * useZeederVoice
 *
 * Sovereign voice-to-action bridge for the ZEEDER client surface.
 *
 * Talks exclusively to the client-scoped `/api/client/process-command`
 * endpoint, which holds no reseller data by construction. Auth is derived
 * from the server session, so no `resellerId` or capability map is sent.
 *
 * @remarks
 * This hook is intentionally **zero-dependency** with respect to the
 * reseller domain. It does NOT import from:
 * - `src/contexts/HannahContext`
 * - `src/hooks/use-voice-command`
 * - `src/lib/reseller/*`
 */
export function useZeederVoice(): {
  /** Send a transcript to the ZEEDER process-command pipeline. */
  handleVoiceCommand: (text: string) => Promise<void>;
  /** Begin a push-to-talk recording (MediaRecorder → /api/client/stt). */
  startListening: () => void;
  /** Stop the active recording and dispatch the captured transcript. */
  stopListening: () => void;
  /** True while the mic is actively capturing audio. */
  isListening: boolean;
  /** Live/captured transcript (surface it in the UI for the spoken-text effect). */
  transcript: string;
  /** True while a voice command is being processed. */
  isProcessing: boolean;
  /** True while the concierge's TTS audio is actively playing back. */
  isSpeaking: boolean;
  /** The last error message if an operation failed. */
  error: string | null;
  /** True when STT fell back to the device Web Speech engine (local-only). */
  sttFallback: boolean;
  /** Reset the error state to null. */
  clearError: () => void;
  /** True when the SYSTEM_HELP capabilities modal should be visible. */
  helpModalOpen: boolean;
  /** Dismiss (close) the SYSTEM_HELP capabilities modal. */
  dismissHelpModal: () => void;
} {
  const { dispatch, clientProfile } = useZeeder();
  // Bridge to the Studio's single source of truth for persona state. This is
  // the Architect's "unified dispatcher": persona changes never touch the
  // disconnected ZeederContext — they flow straight into StudioDraftProvider.
  const { dispatchStudioAction, applyBrandingTheme } = useStudioDraft();
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<ZeederVoiceState>({
    isProcessing: false,
    error: null,
  });
  const [helpModalOpen, setHelpModalOpen] = useState(false);

  // ── Recording (PTT) UI state ────────────────────────────────────
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [sttFallback, setSttFallback] = useState(false);
  // ── TTS playback feedback (drives the "speaking" mic micro-state) ──
  const [isSpeaking, setIsSpeaking] = useState(false);

  const clientProfileRef = useRef(clientProfile);
  useEffect(() => {
    clientProfileRef.current = clientProfile;
  }, [clientProfile]);

  // Guard against concurrent invocations
  const processingRef = useRef(false);

  // Ref bridge so recording callbacks can invoke the latest handleVoiceCommand
  // without capturing it in their dependency arrays (avoids ordering/TDZ issues).
  const handleVoiceCommandRef = useRef<(text: string) => Promise<void>>(
    () => Promise.resolve(),
  );

  // Recording lifecycle refs
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<ReturnType<typeof getSpeechRecognition> extends null ? never : InstanceType<NonNullable<ReturnType<typeof getSpeechRecognition>>> | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef('');

  // ── Cleanup on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      mediaRecorderRef.current = null;
      recognitionRef.current = null;
    };
  }, []);

  /** Stop all mic hardware + recording timers. */
  const teardownRecording = useCallback(() => {
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* noop */ }
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* noop */ }
      recognitionRef.current = null;
    }
  }, []);

  /**
   * Fallback STT: device Web Speech API (local-only, no server round-trip).
   * Used when MediaRecorder/Whisper is unavailable or fails. Surfaces a
   * "Local Engine Active" indicator via `sttFallback`.
   */
  const runWebSpeechFallback = useCallback(() => {
    const SpeechRecognitionAPI = getSpeechRecognition();
    if (!SpeechRecognitionAPI) {
      console.warn('[ZEEDER-VOICE] No STT engine available (Web Speech unsupported).');
      setState(prev => ({ ...prev, error: 'Voice recognition is not available in this browser.' }));
      setIsListening(false);
      return;
    }

    setSttFallback(true);
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: { results: ArrayLike<ArrayLike<{ transcript?: string }>> }) => {
      const captured = (event.results[0]?.[0]?.transcript ?? '').trim();
      transcriptRef.current = captured;
      setTranscript(captured);
      if (captured) handleVoiceCommandRef.current(captured);
    };
    recognition.onerror = () => {
      setIsListening(false);
      teardownRecording();
    };
    recognition.onend = () => {
      setIsListening(false);
      teardownRecording();
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch {
      setIsListening(false);
      setState(prev => ({ ...prev, error: 'Failed to start local voice recognition.' }));
    }
  }, [teardownRecording]);

  /**
   * Transcribe a recorded audio blob via the secure /api/client/stt endpoint.
   * Throws on any failure so the caller can fall back to Web Speech.
   */
  const transcribeBlob = useCallback(async (blob: Blob): Promise<string> => {
    const wavBlob = await transcodeBlobToWav(blob);
    const form = new FormData();
    form.append('file', wavBlob, 'recording.wav');

    const res = await fetch('/api/client/stt', { method: 'POST', body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `STT failed with status ${res.status}`);
    }
    const data = (await res.json()) as { text?: string };
    return data.text?.trim() ?? '';
  }, []);

  /**
   * Begin push-to-talk capture with the high-fidelity MediaRecorder pipeline.
   * Automatically falls back to the device Web Speech engine on any failure.
   */
  const startListening = useCallback(() => {
    if (isListening || processingRef.current) return;

    setTranscript('');
    transcriptRef.current = '';
    setSttFallback(false);
    chunksRef.current = [];

    const startCapture = async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        console.warn('[ZEEDER-VOICE] getUserMedia denied — falling back to Web Speech.');
        runWebSpeechFallback();
        return;
      }

      if (typeof MediaRecorder === 'undefined') {
        stream.getTracks().forEach(t => t.stop());
        runWebSpeechFallback();
        return;
      }

      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        teardownRecording();
        setIsListening(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size === 0) {
          console.warn('[ZEEDER-VOICE] Empty recording, skipping.');
          return;
        }
        try {
          const text = await transcribeBlob(blob);
          transcriptRef.current = text;
          setTranscript(text);
          if (text) handleVoiceCommandRef.current(text);
        } catch (err) {
          console.warn('[ZEEDER-VOICE] Whisper STT failed — falling back to Web Speech.', err);
          runWebSpeechFallback();
        }
      };

      try {
        recorder.start();
        setIsListening(true);
        maxDurationTimerRef.current = setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        }, MAX_RECORDING_MS);
      } catch {
        console.warn('[ZEEDER-VOICE] MediaRecorder.start failed — falling back to Web Speech.');
        teardownRecording();
        runWebSpeechFallback();
      }
    };

    void startCapture();
  }, [isListening, transcribeBlob, runWebSpeechFallback, teardownRecording]);

  /**
   * Stop the active push-to-talk capture (mouseup / touchend / leave).
   * No-op if nothing is recording.
   */
  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* noop */ }
    }
  }, []);

  /**
   * Play the AI summary response as speech via the TTS endpoint.
   */
  async function speakSummary(summary: string): Promise<void> {
    try {
      const ttsResponse = await fetch('/api/ai/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: normalizeTextForTTS(summary), voice: 'hannah' }),
      });
      if (!ttsResponse.ok) {
        console.error('[ZEEDER-VOICE] TTS request failed');
        return;
      }
      const audioBlob = await ttsResponse.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setIsSpeaking(false);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        setIsSpeaking(false);
      };
      setIsSpeaking(true);
      await audio.play();
    } catch {
      console.error('[ZEEDER-VOICE] TTS playback failed');
    }
  }

  /**
   * Send a natural-language transcript through the ZEEDER voice-action pipeline.
   *
   * @param text - The user's spoken command (free-form text).
   */
  const handleVoiceCommand = useCallback(
    async (text: string): Promise<void> => {
      console.log('[TRACE] handleVoiceCommand ENTRY');
      console.log('[TRACE] text:', `"${text}"`);
      console.log('[TRACE] text.length:', text.length);
      console.log('[TRACE] text.trim().length:', text.trim().length);
      console.log('[TRACE] clientProfile:', clientProfile);

      const shouldSkipProcessing = processingRef.current;
      console.log('[TRACE] processingRef.current:', shouldSkipProcessing);
      if (shouldSkipProcessing) {
        console.warn('[ZEEDER-VOICE] handleVoiceCommand rejected — a command is already in flight.');
        return;
      }

      const isTextEmpty = !text || text.trim().length === 0;
      console.log('[TRACE] isTextEmpty:', isTextEmpty);
      if (isTextEmpty) {
        console.warn('[ZEEDER-VOICE] handleVoiceCommand called with empty text.');
        return;
      }

      // Deterministic override: when clientProfile has not yet hydrated,
      // poll for it instead of immediately rejecting.
      if (!clientProfileRef.current) {
        console.warn('[ZEEDER-VOICE] Profile not yet loaded, polling...');
        const hydrated = await pollForProfile(clientProfileRef, 2000);
        if (!hydrated) {
          console.error('[ZEEDER-VOICE] handleVoiceCommand rejected — client profile is missing');
          setState(prev => ({ ...prev, isProcessing: false, error: 'Client profile not resolved.' }));
          return;
        }
      }

      console.log('[TRACE] PASSED ALL GUARDS - proceeding to API call');

      processingRef.current = true;
      setState(prev => ({ ...prev, isProcessing: true, error: null }));

      try {
        // ── Step 1: POST to the client-scoped process-command API ──
        // Surface-isolated: no resellerId, capability map, or tenant context
        // leaves the client. Auth is derived from the server session.
        console.log(`[ZEEDER-VOICE] Sending text to /api/client/process-command: "${text.slice(0, 80)}..."`);

        const response = await fetch('/api/client/process-command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            currentPath: pathname,
            context: {
              clientProfileId: clientProfile?.id,
              activeView: 'client-dashboard',
            },
          }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          const errorMessage =
            errorBody?.error ?? `Server responded with status ${response.status}`;
          console.error(`[ZEEDER-VOICE] API returned ${response.status}: ${errorMessage}`);
          setState(prev => ({ ...prev, isProcessing: false, error: errorMessage }));
          return;
        }

        const data: {
          success?: boolean;
          actionType: string;
          targetIds?: string[];
          payload?: Record<string, unknown>;
          summary?: string;
          error?: string;
        } = await response.json();

        // ── Step 2: Map client actionType to ZEEDER action ID ──────
        const mappedActionId = ACTION_TYPE_TO_ZEEDER_ID[data.actionType] ?? null;

        // ── Unified Dispatcher: Persona bridge ─────────────────────
        // A persona-mode change (carried in aiPersona.personaMode, e.g. from a
        // SYSTEM_UPDATE_BRANDING payload that included persona) is routed
        // directly into the StudioDraftProvider — NEVER through ZeederContext.
        const rawPersonaMode =
          (data.payload as { aiPersona?: { personaMode?: unknown } } | undefined)?.aiPersona
            ?.personaMode;
        const personaMode =
          rawPersonaMode === 'sales' || rawPersonaMode === 'concierge'
            ? rawPersonaMode
            : null;

        if (personaMode) {
          dispatchStudioAction({ type: 'UPDATE_PERSONA', mode: personaMode });
          const spoken =
            data.summary
              ? `${data.summary} I've updated the draft to ${personaMode} mode — please click Save to commit these changes.`
              : `I've updated the draft to ${personaMode} mode — please click Save to commit these changes.`;
          await speakSummary(spoken);
          setState(prev => ({ ...prev, isProcessing: false }));
          console.log(`[ZEEDER-VOICE] Routed persona change → "${personaMode}" via StudioDraftProvider.`);
          return;
        }

        // Misrecognized persona mode (e.g. "concious"): do NOT fall through to the
        // ZeederContext DB-writing dispatch (Path A — no silent commit). Clarify and
        // return instead of producing a 400 from an invalid aiPersona payload.
        if (
          rawPersonaMode !== undefined &&
          rawPersonaMode !== null &&
          rawPersonaMode !== 'sales' &&
          rawPersonaMode !== 'concierge'
        ) {
          const spoken = `I didn't catch a valid persona mode. Please say "sales" or "concierge".`;
          await speakSummary(spoken);
          setState(prev => ({ ...prev, isProcessing: false }));
          console.warn(
            `[ZEEDER-VOICE] Rejected invalid personaMode "${String(rawPersonaMode)}" — clarified instead of dispatching.`
          );
          return;
        }

        // ── SYSTEM_UPDATE_BRANDING: route to Branding Studio ──────────
        // The client endpoint returns an empty payload for this intent (it does
        // not extract branding from free text), so voice cannot apply branding
        // directly here. A bare "Update my branding" (no extracted config) is
        // redirected to the Branding Studio where the user configures visually.
        // If branding IS present in the payload (future extraction), fall through
        // to the normal dispatch/apply path.
        if (data.actionType === 'SYSTEM_UPDATE_BRANDING') {
          const hasBranding = Boolean(
            (data.payload as { branding?: unknown } | undefined)?.branding,
          );
          if (!hasBranding) {
            // The Studio uses route-based tabs (Branding vs Persona are distinct
            // routes). A `tab`/`view` payload tells us which viewport to open;
            // default to Branding when omitted. This lets a voice command like
            // "take me to the persona page" auto-switch the active view rather
            // than asking the user to click the tab manually.
            const tab = (data.payload as { tab?: unknown; view?: unknown } | undefined)?.tab
              ?? (data.payload as { tab?: unknown; view?: unknown } | undefined)?.view;
            const targetPath =
              tab === 'persona'
                ? '/client/dashboard/studio/persona'
                : '/client/dashboard/studio/branding';

            // Mark this as a voice-initiated navigation so the destination
            // VoiceProvider suppresses its generic welcome greeting; our own
            // confirmation below is the only spoken output (no channel overlap).
            markVoiceNavigation();
            // Prefer the endpoint's tailored summary (e.g. a screen-aware
            // persona-mode clarification); fall back to the generic greeting.
            await speakSummary(
              data.summary ?? 'Welcome to your branding page, how can I help?',
            );
            router.push(targetPath);
            setState(prev => ({ ...prev, isProcessing: false }));
            console.log(`[ZEEDER-VOICE] Routed SYSTEM_UPDATE_BRANDING → ${targetPath}`);
            return;
          }
        }

        if (!mappedActionId) {
          // The endpoint responded with a non-ZEEDER action (e.g. SYSTEM_HELP,
          // CLIENT_NOP). This is a successful response but doesn't map to a
          // ZEEDER state-machine action — log and reset.
          console.log(
            `[ZEEDER-VOICE] Endpoint responded with non-ZEEDER actionType: "${data.actionType}" — ${data.summary ?? 'no summary'}`,
          );

          // CLIENT_NOP with a conversational summary: a genuine informational
          // reply (e.g. "What is smart booking?" returns the sales text in
          // summary). Speak it as a successful answer and do NOT fall through
          // to any error/snag path.
          if (data.actionType === 'CLIENT_NOP' && data.summary) {
            await speakSummary(data.summary);
            setState(prev => ({ ...prev, isProcessing: false }));
            console.log('[ZEEDER-VOICE] Spoke CLIENT_NOP informational reply.');
            return;
          }
          // SYSTEM_HELP: elevate from speech-only to a visual capabilities modal.
          // Voice output is retained for accessibility, but the primary output
          // is the modal trigger owned by this hook's consumer.
          if (data.actionType === 'SYSTEM_HELP') {
            setHelpModalOpen(true);
          }

          if (data.summary) {
            await speakSummary(data.summary);
          }
          setState(prev => ({ ...prev, isProcessing: false }));
          return;
        }

        // Double-check the mapped actionId is valid (type-narrowing for dispatch)
        if (!isZeederActionId(mappedActionId)) {
          const errorMsg = `Mapped actionType "${data.actionType}" resolved to invalid actionId: "${mappedActionId}".`;
          console.error(`[ZEEDER-VOICE] ${errorMsg}`);
          setState(prev => ({ ...prev, isProcessing: false, error: errorMsg }));
          return;
        }

        // ── Step 3: Dispatch through ZeederContext ──────────────────
        const dispatchPayload = data.payload ?? {};
        console.log(
          `[ZEEDER-VOICE] Dispatching action: "${mappedActionId}" (from actionType: "${data.actionType}") with payload:`,
          dispatchPayload,
        );

        const result = await dispatch(mappedActionId, dispatchPayload);

        if (!result.success) {
          const fallbackMessage = result.error ?? 'Sorry, I wasn\'t able to complete that.';
          console.error(`[ZEEDER-VOICE] Action "${mappedActionId}" failed:`, result.error);
          await speakSummary(fallbackMessage);
          setState(prev => ({ ...prev, isProcessing: false }));
        } else {
          const spokenText = result.greeting ?? data.summary;
          if (spokenText) {
            await speakSummary(spokenText);
          }
          setState(prev => ({ ...prev, isProcessing: false }));
          console.log(`[ZEEDER-VOICE] Action "${mappedActionId}" completed successfully.`);

          // ── Mirror committed branding into StudioDraft so the live WidgetPreview
          // repaints. The branding voice path auto-commits to the DB via the
          // zeederActionRegistry handler, but never touches StudioDraft — unlike
          // persona changes which route through dispatchStudioAction. Without this,
          // the DB updates (blue→red) but the preview keeps rendering stale draft.
          if (mappedActionId === 'updateBranding') {
            const brandingPatch = (dispatchPayload as { branding?: Partial<CanonicalBranding> }).branding;
            if (brandingPatch) {
              applyBrandingTheme(brandingPatch);
              console.log('[ZEEDER-VOICE] Mirrored branding into StudioDraft for live preview.');
            }
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
        console.error(`[ZEEDER-VOICE] Unhandled error:`, err);
        console.error(`[ZEEDER-VOICE] Error message: ${message}`);
        setState(prev => ({ ...prev, isProcessing: false, error: message }));
      } finally {
        processingRef.current = false;
      }
    },
    [
      dispatch,
      dispatchStudioAction,
      applyBrandingTheme,
      clientProfile,
      router,
      pathname,
    ],
  );

  // Keep the recording callbacks pointed at the latest handleVoiceCommand.
  useEffect(() => {
    handleVoiceCommandRef.current = handleVoiceCommand;
  }, [handleVoiceCommand]);

  const { isListening: globalIsListening } = useVoiceState();

  useEffect(() => {
    if (globalIsListening) {
      console.log('[AudioEngine] Global isListening is TRUE. Initializing media pipeline capture...');
      startListening();
    } else {
      console.log('[AudioEngine] Global isListening is FALSE. Tearing down audio channels...');
      stopListening();
    }
  }, [globalIsListening, startListening, stopListening]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const dismissHelpModal = useCallback(() => {
    setHelpModalOpen(false);
  }, []);

  return {
    handleVoiceCommand,
    startListening,
    stopListening,
    isListening,
    transcript,
    isProcessing: state.isProcessing,
    isSpeaking,
    error: state.error,
    sttFallback,
    clearError,
    helpModalOpen,
    dismissHelpModal,
  };
}
