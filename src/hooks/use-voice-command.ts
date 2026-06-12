'use client';

import { useState, useRef, useCallback, useEffect, type MutableRefObject } from 'react';
import { isInvalidSlug } from '@/lib/utils/guard';
import { transcodeBlobToWav } from '@/utils/audio/transcode-to-wav';

interface UseVoiceCommandReturn {
  /** True while the mic is actively capturing audio. */
  isRecording: boolean;
  /** True while the STT → AI → TTS pipeline is processing. */
  isProcessing: boolean;
  /** True while the TTS AudioContext is actively playing back audio. */
  isSpeaking: boolean;
  /** Mirror of isSpeaking for React consumers (UI gating). */
  ttsPlaying: boolean;
  /** Live volume meter (0–1). Only updated while recording is active. */
  volumeLevel: number;
  /** Latest transcript from STT. */
  transcript: string;
  /** Latest AI response text. */
  aiResponse: string;
  /** Latest error message, if any. */
  error: string | null;
  /** Wall-clock start time of the current press (used for the 500ms tap guard). */
  recordingStartedAtRef: MutableRefObject<number | null>;
  /** Strict PTT: Begin audio capture on mousedown / touchstart. */
  startListening: () => Promise<void>;
  /** @deprecated Use startListening. Retained as a one-cycle alias for UI compatibility. */
  startRecording: () => Promise<void>;
  /** Strict PTT: Finalize audio on mouseup / touchend. Triggers the pipeline if press >= 500ms. */
  stopListeningAndProcess: () => void;
  /** Strict PTT: Abort capture on mouseleave / touchcancel. Never triggers the pipeline. */
  abortRecording: () => void;
  /** Reset all state to idle. Use for navigation exit-paths. */
  resetState: () => void;
}

/** Minimum press duration (ms) before stopListeningAndProcess finalises the pipeline.
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
  actions?: IncomingAIAction[];
  actionType?: string;
  hasAudio?: boolean;
}

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
  resellerId?: string;
  tenantContext?: TenantContext;
  currentConfig?: Record<string, unknown>;
  contextCapabilities?: Record<string, { key?: string; description: string; examples: readonly string[] | string[] }>;
  skipAIPipeline?: boolean;
  onTranscript?: (text: string) => void;
  onAIResponse?: (text: string, payload?: unknown) => void;
  onError?: (error: string) => void;
  onActionsReceived?: (actions: IncomingAIAction[]) => void;
}

export function useVoiceCommand(options: VoiceCommandOptions = {}): UseVoiceCommandReturn {
  const {
    resellerId: _resellerId,
    tenantContext: _tenantContext,
    currentConfig: _currentConfig,
    skipAIPipeline = false,
    contextCapabilities: _contextCapabilities,
    onTranscript,
    onAIResponse,
    onError,
    onActionsReceived,
  } = options;

  // ─── Refs for dynamic options ────────────────────────────────────────
  const resellerIdRef = useRef(options.resellerId);

  // ─── State ────────────────────────────────────────────────────────────────
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const recordingStartedAtRef = useRef<number | null>(null);
  const lastRecordingDurationMsRef = useRef<number | null>(null);

  // ─── Refs for audio handling ──────────────────────────────────────────────
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaMimeTypeRef = useRef<string>('audio/webm');
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isProcessingRef = useRef(false);
  /** Timestamp of the last successful pipeline dispatch entry. */
  const lastPipelineDispatchRef = useRef<number>(0);
  const ttsAudioContextRef = useRef<AudioContext | null>(null);
  const ttsAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ttsPlaybackActiveRef = useRef(false);

  /** Synchronous intention flag: true = user explicitly stopped recording.
   *  The onstop handler uses this instead of isRecordingRef to avoid
   *  the React state-batching race where setIsRecording(false) in
   *  stopListeningAndProcess updates isRecordingRef.current via useEffect
   *  before the MediaRecorder.onstop event fires. */
  const stoppedByUserRef = useRef(false);

  /** Monotonically-increasing session token. Incremented on every new
   *  startRecording() entry and on every abort/stop. If getUserMedia
   *  resolves and the token no longer matches, the stream is a ghost. */
  const currentSessionIdRef = useRef<number>(0);

  /** PTT race guard: set synchronously by stopListeningAndProcess when the user
   *  releases the mic button but getUserMedia hasn't resolved yet. startRecording
   *  checks this after the await to discard the late-resolving stream before
   *  creating the MediaRecorder, preventing runaway chunk generation. */
  const pendingStreamAbortedRef = useRef(false);

  const isRecordingRef = useRef(false);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  const [ttsPlaying, setTtsPlaying] = useState(false);

  const monitorVolumeRef = useRef<() => void>(() => {});
  const tenantContextRef = useRef(options.tenantContext);
  const contextCapabilitiesRef = useRef(options.contextCapabilities);
  useEffect(() => { contextCapabilitiesRef.current = options.contextCapabilities; }, [options.contextCapabilities]);

  const onActionsReceivedRef = useRef(onActionsReceived);
  useEffect(() => { onActionsReceivedRef.current = onActionsReceived; }, [onActionsReceived]);

  const getAudioContextConstructor = useCallback((): typeof AudioContext => {
    if (typeof AudioContext !== 'undefined') return AudioContext;
    if (typeof window !== 'undefined' && 'webkitAudioContext' in window) {
      return (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    }
    return AudioContext;
  }, []);

  const validateAudioResponse = useCallback(
    async (response: Response, source: string):
      Promise<{ ok: true; arrayBuffer: ArrayBuffer } | { ok: false; errorMessage: string }> => {
      if (!response.ok) {
        const status = response.status;
        let msg = `${source} failed: ${status}`;
        try {
          const err = await response.clone().json() as Record<string, unknown>;
          if (typeof err?.error === 'string') msg = err.error;
        } catch { /* ignore */ }
        return { ok: false, errorMessage: msg };
      }
      const ct = response.headers.get('content-type') ?? '';
      if (!ct.includes('audio/')) {
        let msg = `${source} returned non-audio response (${ct})`;
        try {
          const err = await response.clone().json() as Record<string, unknown>;
          if (typeof err?.error === 'string') msg = err.error;
        } catch { /* ignore */ }
        return { ok: false, errorMessage: msg };
      }
      return { ok: true, arrayBuffer: await response.arrayBuffer() };
    },
    []
  );

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

    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    setVolumeLevel(0);
  }, []);

  const abort = useCallback(() => {
    cleanup();
    setIsProcessing(false);
    setIsSpeaking(false);
    setIsRecording(false);
    setTtsPlaying(false);
    abortControllerRef.current?.abort();
  }, [cleanup]);

  const monitorVolume = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const normalizedVolume = average / 255;
    setVolumeLevel(normalizedVolume);

    if (isRecordingRef.current) {
      animationFrameRef.current = requestAnimationFrame(() => {
        monitorVolumeRef.current();
      });
    }
  }, []);

  useEffect(() => {
    monitorVolumeRef.current = monitorVolume;
  }, [monitorVolume]);

  useEffect(() => { tenantContextRef.current = options.tenantContext; }, [options.tenantContext]);
  useEffect(() => { resellerIdRef.current = options.resellerId; }, [options.resellerId]);

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
          actions.push({ type: 'TOGGLE_INSIGHTS', payload: { enabled: p.ui.aiInsightBadge } });
        }
        if (typeof p.ui.aiDesignMirror === 'boolean') {
          actions.push({ type: 'TOGGLE_DESIGN_MIRROR', payload: { enabled: p.ui.aiDesignMirror } });
        }
        if (typeof p.ui.customCss === 'boolean') {
          actions.push({ type: 'SET_CUSTOM_CSS', payload: { enabled: p.ui.customCss } });
        }
      }

      if (p.theme && typeof p.theme === 'object' && Object.keys(p.theme).length > 0) {
        const type: 'APPLY_VIBE' | 'UPDATE_THEME_COLORS' =
          actionType === 'SYSTEM_UPDATE_BRANDING' ? 'APPLY_VIBE' : 'UPDATE_THEME_COLORS';
        actions.push({ type, payload: { theme: p.theme } });
      }

      if (p.header || p.footer || p.widget) {
        const type: 'APPLY_VIBE' | 'UPDATE_THEME_COLORS' =
          actionType === 'SYSTEM_UPDATE_BRANDING' ? 'APPLY_VIBE' : 'UPDATE_THEME_COLORS';

        const existingThemeAction = actions.find(
          (a): a is typeof a & { payload: { theme: Record<string, unknown>; header?: Record<string, unknown>; footer?: Record<string, unknown>; widget?: Record<string, unknown> } } =>
          (a.type === 'APPLY_VIBE' || a.type === 'UPDATE_THEME_COLORS') && 'theme' in a.payload
        );

        if (existingThemeAction) {
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

  const processAudioPipeline = useCallback(async (audioBlob: Blob) => {
    // ── Synchronous execution lock: reject if pipeline is already running ──
    if (isProcessingRef.current) {
      console.warn('[VoiceCommand] 🚫 processAudioPipeline — already processing, dropping duplicate');
      return;
    }

    // ── Temporal guardian: reject re-entry within 1000 ms window ──
    const now = Date.now();
    if (now - lastPipelineDispatchRef.current < 1000) {
      console.warn('[VoiceCommand] 🚫 processAudioPipeline — within 1000 ms window, dropping duplicate');
      return;
    }

    // Lock immediately and synchronously before any await
    isProcessingRef.current = true;
    lastPipelineDispatchRef.current = now;
    setIsProcessing(true);

    console.log(`[VoiceCommand] 📡 processAudioPipeline — blob size: ${audioBlob.size} bytes, initiating STT`);
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    const currentResellerId = resellerIdRef.current;
    if (!currentResellerId || isInvalidSlug(currentResellerId)) {
      console.warn('[VoiceCommand] 🚫 Blocking pipeline — resellerId not yet resolved:', currentResellerId);
      isProcessingRef.current = false;
      setIsProcessing(false);
      return;
    }

    try {
      const wavBlob = await transcodeBlobToWav(audioBlob);
      console.log(`[VoiceCommand] 📡 WAV transcode done — ${wavBlob.size} bytes`);
      const audioFile = new File([wavBlob], 'command.wav', { type: 'audio/wav' });

      const sttFormData = new FormData();
      sttFormData.append('file', audioFile);
      console.log('[VoiceCommand] 📡 STT request initiated — POST /api/ai/stt');

      const sttResponse = await fetch('/api/ai/stt', {
        method: 'POST',
        body: sttFormData,
        signal,
      });

      if (!sttResponse.ok) {
        const status = sttResponse?.status;
        const statusText = sttResponse?.statusText ?? 'Unknown';
        let errorData: Record<string, unknown> = {};

        const responseClone = sttResponse.clone();
        try {
          errorData = (await sttResponse.json()) as Record<string, unknown>;
        } catch {
          try {
            const rawText = await responseClone.text();
            if (rawText) errorData = { raw: rawText.slice(0, 500) };
          } catch { /* ignore */ }
        }

        console.error(`[STT] Server Response Error:\n${JSON.stringify({ url: '/api/ai/stt', method: 'POST', status: status ?? 'unknown', statusText, body: errorData }, null, 2)}`);

        const rawServerError = (errorData.error as string | undefined) ?? statusText;
        const friendlyError = rawServerError.includes('could not process file')
          ? 'Recording too short or no speech detected. Please hold the button longer and speak clearly.'
          : rawServerError;

        throw new Error(`STT failed: ${status ?? 'unknown'} - ${friendlyError}`);
      }

      console.log('[VoiceCommand] 📡 STT response OK — parsing transcript');
      const { text } = await sttResponse.json() as SttResponse;
      setTranscript(text);
      onTranscript?.(text);

      if (skipAIPipeline) return;

      const currentContext = tenantContextRef.current || {};
      const processResponse = await fetch('/api/ai/process-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resellerId: currentResellerId.trim(),
          userCommand: text,
          currentConfig: _currentConfig || {},
          contextCapabilities: contextCapabilitiesRef.current || undefined,
          tenantContext: { tenantId: currentContext.tenantId, category: currentContext.category || 'GENERAL' },
        }),
        signal,
      });

      if (!processResponse.ok) throw new Error(`Process failed: ${processResponse.status}`);

      const parsedResponse = await processResponse.json() as ProcessResponse;
      const aiText = parsedResponse?.response || parsedResponse?.summary;
      if (!aiText || !aiText.trim()) {
        console.warn('[VoiceHook] Aborting internal TTS: No text or fallback summary available.');
        return;
      }
      setAiResponse(aiText);
      onAIResponse?.(aiText, parsedResponse?.payload);

      try {
        const explicit = Array.isArray(parsedResponse?.actions) ? (parsedResponse!.actions as IncomingAIAction[]) : null;
        const actions = explicit ?? deriveActionsFromPayload(parsedResponse?.payload, parsedResponse?.actionType);
        if (actions.length > 0) onActionsReceivedRef.current?.(actions);
      } catch (actionErr) {
        console.warn('[VoiceCommand] ⚠️ onActionsReceived threw — action dispatcher error:', actionErr);
      }

      const SYSTEM_MACRO_NO_AUDIO = new Set([
        'SYSTEM_DISARM', 'SYSTEM_BULK_CONFIRM', 'SYSTEM_BULK_CANCEL',
        'SYSTEM_FILTER_GRID', 'NO_MATCH',
      ]);

      // ── SYSTEM_HELP TTS Allowlist ───────────────────────────────────────────
      // SYSTEM_HELP must NOT be gated by `hasAudio === false` — it carries
      // meaningful help text that Hannah must read aloud. Without this carve-out,
      // the voice pipeline's hasAudio gate silently swallows the TTS call,
      // causing Hannah to remain silent when the user asks "what can you do?".
      const VOICE_TTS_ALLOWLIST = new Set(['SYSTEM_HELP', 'SYSTEM_EXPLAIN', 'SYSTEM_NOTE']);

      if (
        parsedResponse?.actionType && SYSTEM_MACRO_NO_AUDIO.has(parsedResponse.actionType)
        || (parsedResponse?.hasAudio === false && !VOICE_TTS_ALLOWLIST.has(parsedResponse?.actionType ?? ''))
      ) {
        console.log('[VoiceCommand] 🔷 System macro — skipping TTS playback:', parsedResponse?.actionType);
        return;
      }

      const currentTtsContext = tenantContextRef.current || {};
      const ttsResponse = await fetch('/api/ai/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: aiText.trim(),
          voice: 'hannah',
          model: 'orpheus-v1',
          metadata: { resellerSlug: currentResellerId.trim(), tenantId: currentTtsContext.tenantId, category: currentTtsContext.category },
        }),
        signal,
      });

      const validated = await validateAudioResponse(ttsResponse, 'TTS');
      if (!validated.ok) {
        setIsSpeaking(false);
        setTtsPlaying(false);
        throw new Error(validated.errorMessage);
      }

      setIsSpeaking(true);
      ttsPlaybackActiveRef.current = true;
      setTtsPlaying(true);

      const ttsCtx = ttsAudioContextRef.current;
      if (!ttsCtx) throw new Error('TTS AudioContext not initialized');

      if (ttsAudioSourceRef.current) {
        try { ttsAudioSourceRef.current.stop(); } catch { /* ignore */ }
        ttsAudioSourceRef.current = null;
      }

      const audioBuffer = await ttsCtx.decodeAudioData(validated.arrayBuffer);
      const source = ttsCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ttsCtx.destination);
      if (ttsCtx.state === 'suspended') await ttsCtx.resume();
      source.start(0);
      ttsAudioSourceRef.current = source;

      const playbackMs = Math.ceil(audioBuffer.duration * 1000) + 500;
      setTimeout(() => {
        ttsPlaybackActiveRef.current = false;
        setTtsPlaying(false);
        setIsSpeaking(false);
        ttsAudioSourceRef.current = null;
      }, playbackMs);

    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Voice command aborted');
        return;
      }
      const errorMsg = err instanceof Error ? err.message : 'Voice command failed';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [onTranscript, onAIResponse, onError, skipAIPipeline, _currentConfig, deriveActionsFromPayload, validateAudioResponse]);

  // ─── STRICT PTT: startListening — mousedown / touchstart handler ────────
  // Alias: startRecording is exposed on the return as startRecording for UI compatibility.
  const startRecording = useCallback(async () => {
    console.log('[VoiceCommand] 🎤 startRecording invoked — entering mic capture path');
    if (isRecordingRef.current) {
      console.log('[VoiceCommand] 🚫 Idempotency guard — already recording');
      return;
    }
    if (ttsPlaybackActiveRef.current) {
      console.warn('[VoiceCommand] 🚫 TTS active — blocking mic start');
      return;
    }
    console.log('[VoiceCommand] ✅ Idempotency check cleared — proceeding with getUserMedia');

    recordingStartedAtRef.current = Date.now();
    stoppedByUserRef.current = false;
    currentSessionIdRef.current += 1;
    const sessionId = currentSessionIdRef.current;
    setIsRecording(true);

    try {
      setTranscript('');
      setAiResponse('');
      setError(null);
      setVolumeLevel(0);
      audioChunksRef.current = [];

      console.log('[VoiceCommand] 🎙️ getUserMedia requested — stream starting');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Ghost stream guard: if the session was invalidated or the user released
      // the mic button while getUserMedia was resolving, discard the stream
      // immediately to prevent runaway MediaRecorder chunk generation.
      if (currentSessionIdRef.current !== sessionId || pendingStreamAbortedRef.current) {
        pendingStreamAbortedRef.current = false;
        stream.getTracks().forEach(track => track.stop());
        console.warn('[VoiceCommand] 🛑 Late-resolving stream discarded — session invalidated or button released early');
        return;
      }

      console.log(`[VoiceCommand] 📡 getUserMedia granted — tracks: ${stream.getTracks().map(t => `${t.kind}/${t.readyState}`).join(', ')}`);
      streamRef.current = stream;

      const AudioContextCtor = getAudioContextConstructor();
      const audioContext = new AudioContextCtor();
      audioContextRef.current = audioContext;

      const ttsCtx = new AudioContextCtor();
      ttsAudioContextRef.current = ttsCtx;
      await ttsCtx.resume();

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaMimeTypeRef.current = mediaRecorder.mimeType;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log(`[VoiceCommand] 📦 ondataavailable — chunk ${event.data.size} bytes, total ${audioChunksRef.current.length} chunks`);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log(`[VoiceCommand] 🔴 onstop fired — stoppedByUser=${stoppedByUserRef.current}, isRecordingRef=${isRecordingRef.current}`);
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaMimeTypeRef.current });
        console.log(`[VoiceCommand] 🔴 onstop — blob size: ${audioBlob.size} bytes, chunks collected: ${audioChunksRef.current.length}`);
        audioChunksRef.current = [];

        if (audioBlob.size < 4096) {
          console.warn('[VoiceCommand] ⚠️ onstop — blob too small (%d bytes), skipping pipeline', audioBlob.size);
          cleanup();
          return;
        }

        if (!stoppedByUserRef.current) {
          console.warn('[VoiceCommand] ⚠️ onstop — stoppedByUserRef=false, skipping pipeline (abort/cleanup)');
          cleanup();
          return;
        }

        console.log('[VoiceCommand] 📡 onstop — dispatching processAudioPipeline');
        await processAudioPipeline(audioBlob);
        cleanup();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      monitorVolumeRef.current();

    } catch (err: unknown) {
      setIsRecording(false);
      const errorMsg = err instanceof Error ? err.message : 'Failed to access microphone';
      setError(errorMsg);
      onError?.(errorMsg);
      cleanup();
    }
  }, [processAudioPipeline, cleanup, onError, getAudioContextConstructor]);

  // Public API alias: startListening matches the task spec method name
  const startListening = startRecording;

  const stopListeningAndProcess = useCallback(() => {
    console.log(`[VoiceCommand] 🎙️ stopListeningAndProcess invoked — isRecordingRef=${isRecordingRef.current}`);
    if (!isRecordingRef.current) {
      console.warn('[VoiceCommand] 🚫 stopListeningAndProcess — isRecordingRef=false, early return');
      return;
    }
    const startedAt = recordingStartedAtRef.current;
    recordingStartedAtRef.current = null;
    setIsRecording(false);

    const elapsed = startedAt !== null ? Date.now() - startedAt : Infinity;
    lastRecordingDurationMsRef.current = elapsed;

    if (elapsed < MIN_RECORDING_DURATION_MS) {
      console.log(`[VoiceCommand] ⏱ Tap too short (${elapsed}ms < ${MIN_RECORDING_DURATION_MS}ms) — aborting`);
      stoppedByUserRef.current = false;
      currentSessionIdRef.current += 1;
      cleanup();
      return;
    }

    stoppedByUserRef.current = true;
    // ── PTT Race Guard ──────────────────────────────────────────────────
    // If getUserMedia hasn't resolved yet (mediaRecorderRef is null), set
    // the abort flag so the pending startRecording callback discards the
    // late-resolving stream before creating a MediaRecorder.
    if (!mediaRecorderRef.current) {
      pendingStreamAbortedRef.current = true;
      console.log('[VoiceCommand] ⏹️ stopListeningAndProcess — pending stream abort flagged (getUserMedia not yet resolved)');
    }
    console.log(`[VoiceCommand] ⏹️ stopListeningAndProcess — elapsed ${elapsed}ms, calling mediaRecorder.stop()`);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
    } else {
      console.warn(`[VoiceCommand] 🚫 stopListeningAndProcess — mediaRecorder state is ${mediaRecorderRef.current?.state ?? 'null'}, not recording`);
    }
  }, [cleanup]);

  const abortRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    recordingStartedAtRef.current = null;
    stoppedByUserRef.current = false;
    currentSessionIdRef.current += 1;
    setIsRecording(false);
    console.log('[VoiceCommand] 🛑 abortRecording — drag-off or touch-cancel detected');
    cleanup();
  }, [cleanup]);

  const resetState = useCallback(() => {
    isProcessingRef.current = false;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsProcessing(false);
    setIsSpeaking(false);
    setTtsPlaying(false);
    setIsRecording(false);
    stoppedByUserRef.current = false;
    console.log('[VoiceCommand] 🔄 State reset to idle');
  }, []);

  useEffect(() => {
    const handleKeyDown = (_e: KeyboardEvent) => {
      if (_e.key === 'Escape' && (isRecording || isProcessing || isSpeaking)) {
        abort();
        resetState();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording, isProcessing, isSpeaking, abort, resetState]);

  // ── Ironclad Unmount Cleanup (HMR / Fast Refresh Safe) ─────────────
  // HMR / Fast Refresh can leave the MediaRecorder in 'recording' state
  // with live microphone tracks, causing runaway chunk generation loops.
  // This effect must NOT depend on `cleanup` — the callback may hold stale
  // refs after HMR. Instead, we capture all refs in the closure at mount
  // time and destroy them aggressively on unmount.
  useEffect(() => {
    return () => {
      // ── Session Invalidation ────────────────────────────────────────
      // Bump the session token so any late-resolving getUserMedia or
      // onstop callback from a stale mount is rejected by the ghost
      // stream guard in startRecording.
      currentSessionIdRef.current += 1;
      stoppedByUserRef.current = false;

      // ── Force-kill Active MediaRecorder ──────────────────────────────
      // Use try/catch around every destroy operation so a single failure
      // never cascades and leaves the mic open.
      if (mediaRecorderRef.current) {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
        mediaRecorderRef.current = null;
      }

      // ── Force-kill All Media (Mic) Tracks ────────────────────────────
      // Close the mic stream unconditionally so the browser releases the
      // hardware resource immediately, preventing runaway chunk loops.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          try { track.stop(); } catch { /* ignore */ }
        });
        streamRef.current = null;
      }

      // ── Terminate Audio Contexts (Both Mic & TTS) ────────────────────
      [audioContextRef, ttsAudioContextRef].forEach(ctxRef => {
        if (ctxRef.current && ctxRef.current.state !== 'closed') {
          try { ctxRef.current.close(); } catch { /* ignore */ }
        }
        ctxRef.current = null;
      });
      ttsAudioSourceRef.current = null;
      analyserRef.current = null;

      // ── Reset PTT Race Guard ──────────────────────────────────────────
      pendingStreamAbortedRef.current = false;

      // ── Cancel Pending Frames & In-flight Requests ───────────────────
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      isProcessingRef.current = false;

      // ── Clear Accumulated Audio Chunks & Reset UI State ──────────────
      audioChunksRef.current = [];
      setVolumeLevel(0);
    };
  }, []);

  return {
    isRecording,
    isProcessing,
    isSpeaking,
    ttsPlaying,
    volumeLevel,
    transcript,
    aiResponse,
    error,
    recordingStartedAtRef,
    startListening,
    startRecording,
    stopListeningAndProcess,
    abortRecording,
    resetState,
  };
}