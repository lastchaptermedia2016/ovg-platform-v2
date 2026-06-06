'use client';

import { useState, useRef, useCallback, useEffect, type MutableRefObject } from 'react';
import { isInvalidSlug } from '@/lib/utils/guard';
import { transcodeBlobToWav } from '@/utils/audio/transcode-to-wav';

interface UseVoiceCommandReturn {
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  volumeLevel: number;
  transcript: string;
  aiResponse: string;
  error: string | null;
  /** NEW (PTT): Whether the mic button is currently being held down. */
  isRecording: boolean;
  /** NEW (PTT): Wall-clock start time of the current press (used for the 500ms tap guard). */
  recordingStartedAtRef: MutableRefObject<number | null>;
  /** NEW (PTT): Begin audio capture on mousedown / touchstart. Clears any previous pipeline state. */
  startRecording: () => Promise<void>;
  /** NEW (PTT): Finalize the audio chunk on mouseup / touchend. Triggers the pipeline if the press was >= 500ms; aborts otherwise. */
  stopRecording: () => void;
  /** NEW (PTT): Abort capture on mouseleave / touchcancel. Never triggers the pipeline. */
  abortRecording: () => void;
  /** @deprecated Use startRecording instead. Retained as a one-cycle alias. */
  startListening: () => Promise<void>;
  /** @deprecated Use stopRecording instead. Retained as a one-cycle alias. */
  stopListening: () => void;
  abort: () => void;
  /** NEW: Whether the mic is explicitly activated (higher-level than isListening) */
  voiceActive: boolean;
  /** NEW: Explicitly activate the mic (Push-to-Talk entry point) */
  activateVoice: () => Promise<void>;
  /** NEW: Explicitly deactivate the mic (Push-to-Talk exit point) */
  deactivateVoice: () => void;
  /** NEW: Reset the pipeline lock so the next manual startListening works.
   *  Called when the UI explicitly authorises a new recording cycle
   *  (e.g. onAutoDeactivate, after a lifecycle reset). */
  resetPipelineLock: () => void;
  /** NEW: Comprehensive quiescent-state reset for navigation exit-paths.
   *  Releases the pipeline lock AND the processing flag, then halts any
   *  in-flight audio capture so the hook returns to a clean idle state. */
  resetPipeline: () => void;
}

/** Minimum press duration (ms) before stopRecording finalises the pipeline.
 *  Presses shorter than this are treated as accidental taps and aborted.
 *  500ms is the lower bound at which a webm/opus container has produced
 *  a valid, decodeable header + initial frames for Groq Whisper. */
const MIN_RECORDING_DURATION_MS = 500;

interface TenantContext {
  tenantId?: string;
  category?: string;
}

interface ProcessResponse {
  response: string;
  summary?: string;
  payload?: unknown;
  /** Optional explicit action array — the server may return structured actions directly.
   *  When absent, the hook derives them from `payload` to remain backward-compatible. */
  actions?: IncomingAIAction[];
  /** Top-level actionType (e.g. 'SYSTEM_UPDATE_BRANDING') — used to disambiguate
   *  APPLY_VIBE vs UPDATE_THEME_COLORS when deriving from payload. */
  actionType?: string;
}

/**
 * Discriminated union for the structural action array extracted from the
 * AI agent's processed command payload. Consumed by the UI's action dispatcher
 * to drive layout variables in real-time.
 *
 * NOTE: This type lives next to the hook so the API contract is colocated
 * with the code that extracts it. The frontend mirrors it in
 * `ClientBrandingStudio.tsx`.
 */
export type IncomingAIAction =
  | { type: 'TOGGLE_INSIGHTS';      payload: { enabled: boolean } }
  | { type: 'TOGGLE_DESIGN_MIRROR'; payload: { enabled: boolean } }
  | { type: 'SET_CUSTOM_CSS';       payload: { enabled: boolean } }
  | { type: 'APPLY_VIBE';           payload: { theme: Record<string, unknown>; header?: Record<string, unknown>; footer?: Record<string, unknown>; widget?: Record<string, unknown> } }
  | { type: 'UPDATE_THEME_COLORS';  payload: { theme: Record<string, unknown>; header?: Record<string, unknown>; footer?: Record<string, unknown>; widget?: Record<string, unknown> } }
  | { type: 'APPLY_BRAND_VIBE';     payload: { vibeText?: string } }
  | { type: 'SAVE_STUDIO_CONFIG';   payload?: Record<string, never> }
  | { type: 'TRIGGER_AI_MAGIC';     payload?: Record<string, never> };

interface SttResponse {
  text: string;
}

interface VoiceCommandOptions {
  silenceThreshold?: number;
  silenceDuration?: number;
  forcedContinuousMode?: boolean;
  resellerId?: string;
  tenantContext?: TenantContext;
  currentConfig?: Record<string, unknown>;
  contextCapabilities?: Record<string, { key?: string; description: string; examples: readonly string[] | string[] }>;
  skipAIPipeline?: boolean;
  onTranscript?: (text: string) => void;
  onAIResponse?: (text: string, payload?: unknown) => void;
  onError?: (error: string) => void;
  /** NEW: Enable explicit activation (Push-to-Talk) mode. Disables auto-stop on silence. */
  explicitActivation?: boolean;
  /** NEW: Fires when the 10s idle timeout elapses and mic auto-deactivates */
  onAutoDeactivate?: () => void;
  /** Fires when the MAX_RECORDING_DURATION_MS cap is hit and the recorder is auto-stopped.
   *  Use this to surface UX feedback (e.g. speak "Processing your command..."). */
  onMaxDuration?: () => void;
  /** NEW: Fires when the AI's structural action array is extracted/derived from the
   *  processed command payload. Use this to drive UI layout variables in real-time
   *  (e.g. toggle the AI Insight Badge, apply theme colors). The array is sourced
   *  from `parsedResponse.actions` if the server returns it, otherwise derived from
   *  `parsedResponse.payload` for backward compatibility. */
  onActionsReceived?: (actions: IncomingAIAction[]) => void;
}

/** Default idle timeout in milliseconds before the mic auto-deactivates */
const IDLE_TIMEOUT_MS = 10_000;

/** Maximum recording duration in milliseconds — keeps blobs within Groq Whisper's
 *  practical file-size limit (~200 KB for audio/webm;codecs=opus). */
const MAX_RECORDING_DURATION_MS = 5_000;

export function useVoiceCommand(options: VoiceCommandOptions = {}): UseVoiceCommandReturn {
  const {
    silenceThreshold = 0.02,
    silenceDuration = 3000,
    forcedContinuousMode = false,
    resellerId: _resellerId,
    tenantContext: _tenantContext,
    currentConfig: _currentConfig,
    skipAIPipeline = false,
    contextCapabilities: _contextCapabilities,
    onTranscript,
    onAIResponse,
    onError,
    explicitActivation = false,
    onAutoDeactivate,
    onMaxDuration,
    onActionsReceived,
  } = options;

  // ─── Refs for dynamic options ────────────────────────────────────────
  // Synced via useEffect (React 19 compliant). This is safe because the
  // mic pipeline is only triggered by explicit user action (click), so the
  // effect will have fired and synced the ref before any async work runs.
  const resellerIdRef = useRef(options.resellerId);

  // ─── State ────────────────────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [error, setError] = useState<string | null>(null);

  /** NEW: Higher-level activation state for Push-to-Talk */
  const [voiceActive, setVoiceActive] = useState(false);

  // ─── NEW (PTT): Push-to-Talk state machine ───────────────────────────────
  /** Whether the mic button is currently being held down. */
  const [isRecording, setIsRecording] = useState(false);
  /** Wall-clock start time of the current press (used by the 500ms tap guard). */
  const recordingStartedAtRef = useRef<number | null>(null);
  /** Wall-clock duration of the most recent completed press. Captured in
   *  stopRecording and consumed in processAudioPipeline for diagnostic
   *  correlation with the server's `Received file` log. */
  const lastRecordingDurationMsRef = useRef<number | null>(null);
  /** Mirror of `isRecording` for synchronous access in event handlers / abort paths. */
  const isRecordingRef = useRef(false);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  // ─── Refs for audio handling ──────────────────────────────────────────────
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  /** Captures the actual mimeType selected by MediaRecorder to avoid
   *  Blob/File type mismatch when the browser falls back to audio/mp4. */
  const mediaMimeTypeRef = useRef<string>('audio/webm');
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isProcessingRef = useRef(false);
  const ttsAudioContextRef = useRef<AudioContext | null>(null);
  const ttsAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  // Pipeline latch: prevents re-triggering after a max-duration stop.
  // Set to true by the max-duration handler; only cleared by explicit
  // user action (deactivateVoice / resetPipelineLock).
  const isLockedRef = useRef(false);

  // Hard cap: auto-stop recording after 10s to stay within Groq Whisper's
  // practical file-size limit (~200 KB). Recordings beyond this consistently
  // produce 400 "could not process file" errors regardless of codec.
  const maxDurationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Ref indirection to break circular deps between monitorVolume and stopListening
  const stopListeningRef = useRef<() => void>(() => {});
  // Ref indirection for monitorVolume to avoid self-referencing in requestAnimationFrame
  const monitorVolumeRef = useRef<() => void>(() => {});
  // Refs for dynamic hook options to avoid stale closures without recreating callbacks
  const tenantContextRef = useRef(options.tenantContext);
  const contextCapabilitiesRef = useRef(options.contextCapabilities);
  useEffect(() => { contextCapabilitiesRef.current = options.contextCapabilities; }, [options.contextCapabilities]);

  // ─── NEW: 10s idle timeout refs ───────────────────────────────────────────
  const voiceActiveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const deactivateVoiceRef = useRef<() => void>(() => {});
  const onAutoDeactivateRef = useRef(onAutoDeactivate);
  useEffect(() => { onAutoDeactivateRef.current = onAutoDeactivate; }, [onAutoDeactivate]);

  const onMaxDurationRef = useRef(onMaxDuration);
  useEffect(() => { onMaxDurationRef.current = onMaxDuration; }, [onMaxDuration]);

  // ─── NEW: Action dispatcher ref (prevents stale-closure in processAudioPipeline) ────
  // Synced via useEffect to keep the ref current without recreating the pipeline callback.
  const onActionsReceivedRef = useRef(onActionsReceived);
  useEffect(() => { onActionsReceivedRef.current = onActionsReceived; }, [onActionsReceived]);

  const getAudioContextConstructor = useCallback((): typeof AudioContext => {
    if (typeof AudioContext !== 'undefined') return AudioContext;
    if (typeof window !== 'undefined' && 'webkitAudioContext' in window) {
      return (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    }
    return AudioContext;
  }, []);

  // ─── NEW: Start/reset the 10s idle timeout ──────────────────────────────
  const resetVoiceActiveTimeout = useCallback(() => {
    if (!explicitActivation) return;
    if (voiceActiveTimeoutRef.current) {
      clearTimeout(voiceActiveTimeoutRef.current);
    }
    voiceActiveTimeoutRef.current = setTimeout(() => {
      console.log('[VoiceCommand] ⏰ 10s idle timeout reached — auto-deactivating mic');
      onAutoDeactivateRef.current?.();
      deactivateVoiceRef.current();
    }, IDLE_TIMEOUT_MS);
  }, [explicitActivation]);

  // Cleanup the idle timeout
  const clearVoiceActiveTimeout = useCallback(() => {
    if (voiceActiveTimeoutRef.current) {
      clearTimeout(voiceActiveTimeoutRef.current);
      voiceActiveTimeoutRef.current = null;
    }
  }, []);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }
    mediaRecorderRef.current = null;

    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;

    // NOTE: ttsAudioContextRef is intentionally NOT closed here.
    // It is a long-lived resource managed by the TTS playback lifecycle
    // (onended/timeout) and should only be closed on component unmount or abort.
    // Closing it here would act as a "kill shot" to active TTS playback.

    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    setVolumeLevel(0);
  }, []);

  // Abort handler for Escape key
  const abort = useCallback(() => {
    cleanup();
    setIsListening(false);
    setIsProcessing(false);
    setIsSpeaking(false);
    abortControllerRef.current?.abort();
    // Also reset activation state
    if (explicitActivation) {
      setVoiceActive(false);
      clearVoiceActiveTimeout();
    }
  }, [cleanup, explicitActivation, clearVoiceActiveTimeout]);

  // Monitor volume levels - uses ref for stopListening to avoid circular deps
  const monitorVolume = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const normalizedVolume = average / 255;
    setVolumeLevel(normalizedVolume);

    // In explicit activation mode, silence timer does NOT auto-stop
    // It only runs in legacy mode for backward compatibility
    if (!explicitActivation) {
      if (!forcedContinuousMode && normalizedVolume < silenceThreshold) {
        if (!silenceTimerRef.current && !isProcessingRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            stopListeningRef.current();
          }, silenceDuration);
        }
      } else {
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      monitorVolumeRef.current();
    });
  }, [silenceThreshold, silenceDuration, forcedContinuousMode, explicitActivation]);

  useEffect(() => {
    monitorVolumeRef.current = monitorVolume;
  }, [monitorVolume]);

  // Keep dynamic option refs synced to prevent stale closures
  useEffect(() => { tenantContextRef.current = options.tenantContext; }, [options.tenantContext]);
  useEffect(() => { resellerIdRef.current = options.resellerId; }, [options.resellerId]);

  // Stop listening — triggers recorder finalization only.
  // cleanup() is intentionally deferred to the onstop handler below.
  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      // Force a final ondataavailable flush before stop() so the last
      // cluster is written into audioChunksRef before onstop assembles the Blob.
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
    }
    setIsListening(false);
  }, []);

  // Keep stopListeningRef synced outside render via useEffect
  useEffect(() => {
    stopListeningRef.current = stopListening;
  }, [stopListening]);

  /**
   * Pure helper: derives an `IncomingAIAction[]` from the AI response payload.
   * Backward-compatible: the server may return the new shape (`payload.actions`)
   * OR the legacy shape (`payload.theme`, `payload.ui`). When the server eventually
   * returns explicit actions, this derivation becomes a no-op fallback.
   *
   * Mapping:
   *   payload.ui.aiInsightBadge  → TOGGLE_INSIGHTS
   *   payload.ui.aiDesignMirror  → TOGGLE_DESIGN_MIRROR
   *   payload.ui.customCss       → SET_CUSTOM_CSS
   *   payload.theme.*            → APPLY_VIBE (when actionType === 'SYSTEM_UPDATE_BRANDING')
   *                                UPDATE_THEME_COLORS (otherwise)
   */
  const deriveActionsFromPayload = useCallback(
    (payload: unknown, actionType?: string): IncomingAIAction[] => {
      const actions: IncomingAIAction[] = [];
      if (!payload || typeof payload !== 'object') return actions;

      const p = payload as {
        ui?: Record<string, unknown>;
        theme?: Record<string, unknown>;
        header?: Record<string, unknown>;
        footer?: Record<string, unknown>;
        widget?: Record<string, unknown>;
      };

      if (p.ui && typeof p.ui === 'object') {
        if (typeof p.ui.aiInsightBadge === 'boolean') {
          actions.push({
            type: 'TOGGLE_INSIGHTS',
            payload: { enabled: p.ui.aiInsightBadge },
          });
        }
        if (typeof p.ui.aiDesignMirror === 'boolean') {
          actions.push({
            type: 'TOGGLE_DESIGN_MIRROR',
            payload: { enabled: p.ui.aiDesignMirror },
          });
        }
        if (typeof p.ui.customCss === 'boolean') {
          actions.push({
            type: 'SET_CUSTOM_CSS',
            payload: { enabled: p.ui.customCss },
          });
        }
      }

      if (p.theme && typeof p.theme === 'object' && Object.keys(p.theme).length > 0) {
        const type: 'APPLY_VIBE' | 'UPDATE_THEME_COLORS' =
          actionType === 'SYSTEM_UPDATE_BRANDING' ? 'APPLY_VIBE' : 'UPDATE_THEME_COLORS';
        actions.push({ type, payload: { theme: p.theme } });
      }

      // ── Component-Scoped Layout Properties ─────────────────────────────
      // Extract explicit header/footer/widget blocks from the single-root
      // payload so they are preserved alongside the theme layout. These
      // carry component-specific properties (e.g. header.opacity) that
      // should NOT be merged into the generic theme object, but instead
      // applied directly to their corresponding state slice.
      if (p.header || p.footer || p.widget) {
        const type: 'APPLY_VIBE' | 'UPDATE_THEME_COLORS' =
          actionType === 'SYSTEM_UPDATE_BRANDING' ? 'APPLY_VIBE' : 'UPDATE_THEME_COLORS';

        // Merge with existing theme action if one was already pushed,
        // or create a standalone action with the component blocks.
        const existingThemeAction = actions.find(
          (a): a is typeof a & { payload: { theme: Record<string, unknown>; header?: Record<string, unknown>; footer?: Record<string, unknown>; widget?: Record<string, unknown> } } =>
          (a.type === 'APPLY_VIBE' || a.type === 'UPDATE_THEME_COLORS') && 'theme' in a.payload
        );

        if (existingThemeAction) {
          // Augment the existing theme action with component blocks
          if (p.header && typeof p.header === 'object') {
            (existingThemeAction.payload as Record<string, unknown>).header = p.header;
          }
          if (p.footer && typeof p.footer === 'object') {
            (existingThemeAction.payload as Record<string, unknown>).footer = p.footer;
          }
          if (p.widget && typeof p.widget === 'object') {
            (existingThemeAction.payload as Record<string, unknown>).widget = p.widget;
          }
        } else {
          // Push a standalone action for component blocks (no theme present)
          const actionPayload: Record<string, unknown> = { theme: {} };
          if (p.header && typeof p.header === 'object') actionPayload.header = p.header;
          if (p.footer && typeof p.footer === 'object') actionPayload.footer = p.footer;
          if (p.widget && typeof p.widget === 'object') actionPayload.widget = p.widget;
          actions.push({ type, payload: actionPayload } as unknown as IncomingAIAction);
        }
      }

      return actions;
    },
    []
  );

  // Process audio through pipeline
  const processAudioPipeline = useCallback(async (audioBlob: Blob) => {
    console.log('[Pipeline] started, isProcessingRef:', isProcessingRef.current);
    isProcessingRef.current = true;
    setIsProcessing(true);
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    // ── Production Excellence: Slug-Readiness Guard ─────────────────────
    // Read the CURRENT value from the synchronised ref — no stale-closure risk.
    const currentResellerId = resellerIdRef.current;
    if (!currentResellerId || isInvalidSlug(currentResellerId)) {
      console.warn('[VoiceCommand] 🚫 Blocking pipeline — resellerId not yet resolved:', currentResellerId);
      isProcessingRef.current = false;
      setIsProcessing(false);
      return;
    }

    try {
      // ── Production Excellence: Transcode webm/opus → 16kHz mono WAV ──
      // MediaRecorder's raw webm/opus output is rejected by Groq's Whisper
      // decoder as "invalid media" because the live-stream container lacks
      // the index/duration header Whisper requires. We decode the blob
      // through the browser's native AudioContext and re-encode as a
      // canonical RIFF/WAVE (16kHz, mono, 16-bit PCM) — the format
      // Whisper ingests reliably.
      const sourceMimeType = mediaMimeTypeRef.current;
      const wavBlob = await transcodeBlobToWav(audioBlob);
      const audioFile = new File([wavBlob], 'command.wav', { type: 'audio/wav' });

      // Step 1: Speech-to-Text (Whisper)
      const sttFormData = new FormData();

      // ── Diagnostic: confirm what we're sending ────────────────────────
      // Includes wall-clock recording duration so the next STT failure can
      // be directly correlated with the server's `Received file` log to
      // distinguish codec issues from truncation/silence issues.
      console.log('[VoiceCommand] STT dispatch:', {
        sourceBlobSize: audioBlob.size,
        sourceMimeType,
        wavSize: wavBlob.size,
        recordingDurationMs: lastRecordingDurationMsRef.current,
        fileName: audioFile.name,
        fileSize: audioFile.size,
        fileType: audioFile.type,
      });

      sttFormData.append('file', audioFile);
      console.log('[DEBUG] STT FormData keys:', Array.from(sttFormData.keys()));

      const sttResponse = await fetch('/api/ai/stt', {
        method: 'POST',
        body: sttFormData,
        signal,
      });

      if (!sttResponse.ok) {
        const status = sttResponse?.status;
        const statusText = sttResponse?.statusText ?? 'Unknown';
        let errorData: Record<string, unknown> = {};

        // Clone the stream immediately so we have a pristine backup for text extraction
        const responseClone = sttResponse.clone();

        try {
          errorData = (await sttResponse.json()) as Record<string, unknown>;
        } catch {
          // Original stream is disturbed, but our clone is perfectly intact
          try {
            const rawText = await responseClone.text();
            if (rawText) {
              errorData = { raw: rawText.slice(0, 500) };
            }
          } catch {
            // Fallback if the cloned stream is somehow completely inaccessible
          }
        }

        const errorPayload = {
          url: '/api/ai/stt',
          method: 'POST',
          status: status ?? 'unknown',
          statusText,
          body: errorData,
          headers: Object.fromEntries(sttResponse.headers.entries()),
        };

        console.error(`[STT] Server Response Error:\n${JSON.stringify(errorPayload, null, 2)}`);

        // Map known Whisper validation failures to actionable, user-friendly
        // messages. The raw error from extractGroqError() is the clean
        // message; we pattern-match on its content.
        const rawServerError = (errorData.error as string | undefined) ?? statusText;
        const friendlyError = rawServerError.includes('could not process file')
          ? 'Recording too short or no speech detected. Please hold the button longer and speak clearly.'
          : rawServerError;

        throw new Error(
          `STT failed: ${status ?? 'unknown'} - ${friendlyError}`
        );
      }

      const { text } = await sttResponse.json() as SttResponse;
      setTranscript(text);
      onTranscript?.(text);

      if (skipAIPipeline) {
        return;
      }

      const currentContext = tenantContextRef.current || {};
      const processResponse = await fetch('/api/ai/process-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resellerId: currentResellerId.trim(),
          userCommand: text,
          currentConfig: _currentConfig || {},
          contextCapabilities: contextCapabilitiesRef.current || undefined,
          tenantContext: {
            tenantId: currentContext.tenantId,
            category: currentContext.category || 'GENERAL',
          },
        }),
        signal,
      });

      if (!processResponse.ok) {
        throw new Error(`Process failed: ${processResponse.status}`);
      }

      const parsedResponse = await processResponse.json() as ProcessResponse;
      const aiText = parsedResponse?.response || parsedResponse?.summary;
      if (!aiText || !aiText.trim()) {
        console.warn('[VoiceHook] Aborting internal TTS: No text or fallback summary available.');
        return;
      }
      setAiResponse(aiText);
      onAIResponse?.(aiText, parsedResponse?.payload);

      // ── NEW: Extract/derive the structural action array and dispatch to UI ──
      // Runs inside the try block but before TTS playback so the UI updates
      // feel real-time. Wrapped in its own try/catch so a malformed action
      // payload cannot crash the pipeline (the TTS playback must continue).
      try {
        const explicit = Array.isArray(parsedResponse?.actions)
          ? (parsedResponse!.actions as IncomingAIAction[])
          : null;
        const actions = explicit ?? deriveActionsFromPayload(
          parsedResponse?.payload,
          parsedResponse?.actionType
        );
        if (actions.length > 0) {
          onActionsReceivedRef.current?.(actions);
        }
      } catch (actionErr) {
        // Production Excellence: never let action-dispatcher errors break the pipeline
        console.warn('[VoiceCommand] ⚠️ onActionsReceived threw — action dispatcher error:', actionErr);
      }

      // Step 3: Text-to-Speech (Orpheus) — read fresh context from refs
      const currentTtsContext = tenantContextRef.current || {};
      const ttsResponse = await fetch('/api/ai/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: aiText.trim(),
          voice: 'hannah',
          model: 'orpheus-v1',
          metadata: {
            resellerSlug: currentResellerId.trim(),
            tenantId: currentTtsContext.tenantId,
            category: currentTtsContext.category,
          },
        }),
        signal,
      });

      if (!ttsResponse.ok) {
        throw new Error(`TTS failed: ${ttsResponse.status}`);
      }

      // ── Stripped-down TTS playback ──────────────
      setIsSpeaking(true);

      const ttsCtx = ttsAudioContextRef.current;
      if (!ttsCtx) throw new Error('TTS AudioContext not initialized');

      // Stop any currently playing TTS
      if (ttsAudioSourceRef.current) {
        try { ttsAudioSourceRef.current.stop(); } catch {}
        ttsAudioSourceRef.current = null;
      }

      const arrayBuffer = await ttsResponse.arrayBuffer();
      const audioBuffer = await ttsCtx.decodeAudioData(arrayBuffer);

      const source = ttsCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ttsCtx.destination);

      if (ttsCtx.state === 'suspended') {
        await ttsCtx.resume();
      }

      console.log('[TTS] Playing, duration:', audioBuffer.duration, 'ctx state:', ttsCtx.state);

      source.start(0);
      ttsAudioSourceRef.current = source;

      // Single cleanup timeout — fires after audio should be done
      const playbackMs = Math.ceil(audioBuffer.duration * 1000) + 500;
      setTimeout(() => {
        console.log('[TTS] Cleanup timeout fired');
        setIsSpeaking(false);
        ttsAudioSourceRef.current = null;
      }, playbackMs);
      // ── End inner try/catch ─────────────────────────────────────────

    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Voice command aborted');
        return;
      }
      const errorMsg = err instanceof Error ? err.message : 'Voice command failed';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      // Atomic Pipeline Cleanup — the latch MUST release on every exit path,
      // including early returns from throws inside the try, so the next user
      // gesture is never blocked by a stale lock.
      isProcessingRef.current = false;
      setIsProcessing(false);
      isLockedRef.current = false;
    }
  }, [onTranscript, onAIResponse, onError, skipAIPipeline, _currentConfig, deriveActionsFromPayload]);

  // Start listening — safety gate: block all triggers while locked
  const startListening = useCallback(async () => {
    if (isLockedRef.current) {
      console.log('[VoiceCommand] 🔒 Pipeline locked: ignoring trigger');
      return;
    }
    try {
      setTranscript('');
      setAiResponse('');
      setError(null);
      setVolumeLevel(0);
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextCtor = getAudioContextConstructor();
      const audioContext = new AudioContextCtor();
      audioContextRef.current = audioContext;

      // Create a dedicated TTS AudioContext during the user gesture to bypass autoplay policy
      const ttsCtx = new AudioContextCtor();
      ttsAudioContextRef.current = ttsCtx;

      // Proactively resume the context while the user gesture is still active
      await ttsCtx.resume();
      console.log('[Voice] TTS AudioContext state after resume:', ttsCtx.state);

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Prefer audio/webm;codecs=opus — explicit codec prevents browsers from
      // defaulting to video/webm or non-standard Opus headers that Whisper rejects.
      // Fall back to audio/webm (no codec hint) then audio/mp4 for Safari.
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      // Capture the actual mimeType the recorder settled on (matches the constructor arg)
      mediaMimeTypeRef.current = mediaRecorder.mimeType;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // 1. Release mic hardware immediately — before any async work
        mediaRecorder.stream.getTracks().forEach(track => track.stop());

        // 2. Assemble the finalized container — browser has completed the write by now
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaMimeTypeRef.current });

        // 3. Clear chunks regardless of outcome to prevent stale data on next session
        audioChunksRef.current = [];

        // 4. Size guard — 4KB sweet spot. Sub-4KB blobs are almost always
        // truncated or uninitialized webm headers (broken containers).
        // At Opus 64-128 kbps, 500ms of valid audio comfortably clears this
        // threshold; ultra-fast short commands still pass.
        if (audioBlob.size < 4096) {
          console.warn('[VoiceCommand] Blob too small to be a valid media file (%d bytes), skipping pipeline', audioBlob.size);
          cleanup();
          return;
        }

        // 5. Pipeline — exactly once per session, only after container is finalized
        await processAudioPipeline(audioBlob);
        cleanup();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);

      // Hard cap: auto-stop after MAX_RECORDING_DURATION_MS to prevent blobs that
      // exceed Groq's practical Whisper file-size limit (~200 KB for webm;codecs=opus).
      if (maxDurationTimerRef.current) {
        clearTimeout(maxDurationTimerRef.current);
      }
      maxDurationTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          console.log('[VoiceCommand] ⏱ Max recording duration reached — auto-stopping');
          // Lock the pipeline BEFORE stop() so the onstop handler / any
          // TTS-completion intervals that try to re-startListening are blocked.
          isLockedRef.current = true;
          mediaRecorderRef.current.requestData();
          mediaRecorderRef.current.stop();
          setIsListening(false);
          // Notify caller so the UI can surface feedback (e.g. TTS or toast)
          onMaxDurationRef.current?.();
        }
        maxDurationTimerRef.current = null;
      }, MAX_RECORDING_DURATION_MS);

      setIsListening(true);

      // In explicit activation mode, start the idle timeout
      if (explicitActivation) {
        resetVoiceActiveTimeout();
      }

      monitorVolumeRef.current();

    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to access microphone';
      setError(errorMsg);
      onError?.(errorMsg);
      cleanup();
    }
  }, [processAudioPipeline, cleanup, onError, getAudioContextConstructor, explicitActivation, resetVoiceActiveTimeout]);

  // ─── NEW: activateVoice — explicit activation entry point ─────────────────
  const activateVoice = useCallback(async () => {
    if (voiceActive) return; // Already active — no-op
    try {
      await startListening();
      setVoiceActive(true);
    } catch {
      // startListening already sets error state and calls onError
      setVoiceActive(false);
    }
  }, [voiceActive, startListening]);

  // ─── NEW: deactivateVoice — explicit activation exit point ────────────────
  // Must be robust: (1) force the gate open, (2) release hardware, (3) clear timers, (4) update state.
  const deactivateVoice = useCallback(() => {
    // 1. Force the gate open so the next manual action works
    isLockedRef.current = false;

    // 2. Perform actual cleanup
    clearVoiceActiveTimeout();
    stopListening();
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }

    // 3. Update internal UI state
    setVoiceActive(false);
  }, [clearVoiceActiveTimeout, stopListening]);

  // ─── NEW (PTT): startRecording — mousedown / touchstart handler ────────────
  // Begins audio capture immediately, clears any previous pipeline state,
  // and records the wall-clock start time for the 200ms tap guard.
  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) return; // Idempotent: already recording
    recordingStartedAtRef.current = Date.now();
    setIsRecording(true);
    await startListening();
  }, [startListening]);

  // ─── NEW (PTT): stopRecording — mouseup / touchend handler ───────────────
  // Finalizes the audio chunk. Applies the 500ms tap guard: if the press
  // was shorter than MIN_RECORDING_DURATION_MS, abort instead of triggering
  // the pipeline. Strictly deterministic: same input timing → same outcome.
  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    const startedAt = recordingStartedAtRef.current;
    recordingStartedAtRef.current = null;
    setIsRecording(false);

    const elapsed = startedAt !== null ? Date.now() - startedAt : Infinity;
    // Always capture the duration — even aborted presses are useful for
    // understanding what the user actually did. Consumed by the next
    // processAudioPipeline call to enrich the STT dispatch log.
    lastRecordingDurationMsRef.current = elapsed;

    if (elapsed < MIN_RECORDING_DURATION_MS) {
      console.log(`[VoiceCommand] ⏱ Tap too short (${elapsed}ms < ${MIN_RECORDING_DURATION_MS}ms) — aborting`);
      cleanup();
      return;
    }
    stopListening();
  }, [stopListening, cleanup]);

  // ─── NEW (PTT): abortRecording — mouseleave / touchcancel handler ──────
  // Cancels capture WITHOUT triggering the pipeline. Critical production
  // guard: if the user drags off the button mid-press, the press hangs.
  // Never fires the STT / process-command / TTS pipeline.
  const abortRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    recordingStartedAtRef.current = null;
    setIsRecording(false);
    console.log('[VoiceCommand] 🛑 abortRecording — drag-off or touch-cancel detected');
    cleanup();
  }, [cleanup]);

  // Keep deactivateVoiceRef synced so the timeout can call it without deps
  useEffect(() => {
    deactivateVoiceRef.current = deactivateVoice;
  }, [deactivateVoice]);

  // ─── NEW: resetPipelineLock — public API to clear the latch from the UI ───
  const resetPipelineLock = useCallback(() => {
    isLockedRef.current = false;
    console.log('[VoiceCommand] 🔓 Pipeline lock cleared by UI');
  }, []);

  // ─── NEW: resetPipeline — comprehensive quiescent-state reset for navigation exit-paths.
  // Owns its own state: releases the pipeline lock, clears the processing flag,
  // aborts any in-flight fetch, and clears UI state. Does NOT touch the
  // long-lived TTS AudioContext (managed by the playback lifecycle).
  const resetPipeline = useCallback(() => {
    isLockedRef.current = false;
    isProcessingRef.current = false;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsProcessing(false);
    setIsListening(false);
    setIsSpeaking(false);
    console.log('[VoiceCommand] 🔄 Pipeline and locks reset to idle');
  }, []);

  // ─── NEW: Reset idle timeout whenever a new transcript arrives ────────────
  // This keeps the mic hot as long as the user is speaking
  useEffect(() => {
    if (explicitActivation && voiceActive && transcript) {
      resetVoiceActiveTimeout();
    }
  }, [transcript, explicitActivation, voiceActive, resetVoiceActiveTimeout]);

  // Handle Escape key — also deactivates voice in explicit mode
  useEffect(() => {
    const handleKeyDown = (_e: KeyboardEvent) => {
      if (_e.key === 'Escape' && (isListening || isProcessing || isSpeaking)) {
        if (explicitActivation) {
          deactivateVoiceRef.current();
        } else {
          abort();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isListening, isProcessing, isSpeaking, abort, explicitActivation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearVoiceActiveTimeout();
      cleanup();
    };
  }, [clearVoiceActiveTimeout, cleanup]);

  return {
    isListening,
    isProcessing,
    isSpeaking,
    volumeLevel,
    transcript,
    aiResponse,
    error,
    // NEW (PTT): Push-to-Talk state machine
    isRecording,
    recordingStartedAtRef,
    startRecording,
    stopRecording,
    abortRecording,
    // Legacy aliases (one-cycle deprecation)
    startListening,
    stopListening,
    abort,
    // NEW explicit activation API
    voiceActive,
    activateVoice,
    deactivateVoice,
    resetPipelineLock,
    resetPipeline,
  };
}