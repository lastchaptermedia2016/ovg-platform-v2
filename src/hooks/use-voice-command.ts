'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseVoiceCommandReturn {
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  volumeLevel: number;
  transcript: string;
  aiResponse: string;
  error: string | null;
  startListening: () => Promise<void>;
  stopListening: () => void;
  abort: () => void;
  /** NEW: Whether the mic is explicitly activated (higher-level than isListening) */
  voiceActive: boolean;
  /** NEW: Explicitly activate the mic (Push-to-Talk entry point) */
  activateVoice: () => Promise<void>;
  /** NEW: Explicitly deactivate the mic (Push-to-Talk exit point) */
  deactivateVoice: () => void;
}

interface TenantContext {
  tenantId?: string;
  category?: string;
}

interface ProcessResponse {
  response: string;
  summary?: string;
}

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
  skipAIPipeline?: boolean;
  onTranscript?: (text: string) => void;
  onAIResponse?: (text: string) => void;
  onError?: (error: string) => void;
  /** NEW: Enable explicit activation (Push-to-Talk) mode. Disables auto-stop on silence. */
  explicitActivation?: boolean;
  /** NEW: Fires when the 10s idle timeout elapses and mic auto-deactivates */
  onAutoDeactivate?: () => void;
  /** Fires when the MAX_RECORDING_DURATION_MS cap is hit and the recorder is auto-stopped.
   *  Use this to surface UX feedback (e.g. speak "Processing your command..."). */
  onMaxDuration?: () => void;
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
    resellerId,
    tenantContext: _tenantContext,
    currentConfig: _currentConfig,
    skipAIPipeline = false,
    onTranscript,
    onAIResponse,
    onError,
    explicitActivation = false,
    onAutoDeactivate,
    onMaxDuration,
  } = options;

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
  const resellerIdRef = useRef(options.resellerId);

  // ─── NEW: 10s idle timeout refs ───────────────────────────────────────────
  const voiceActiveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const deactivateVoiceRef = useRef<() => void>(() => {});
  const onAutoDeactivateRef = useRef(onAutoDeactivate);
  useEffect(() => { onAutoDeactivateRef.current = onAutoDeactivate; }, [onAutoDeactivate]);

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

    if (ttsAudioSourceRef.current) {
      try {
        ttsAudioSourceRef.current.stop();
        ttsAudioSourceRef.current.disconnect();
      } catch {
        // Ignore errors during cleanup
      }
      ttsAudioSourceRef.current = null;
    }

    if (ttsAudioContextRef.current?.state !== 'closed') {
      ttsAudioContextRef.current?.close();
    }
    ttsAudioContextRef.current = null;

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
   * Derives a file extension from a MIME type string.
   * Returns '.webm' for audio/webm, '.mp4' for everything else (audio/mp4, etc.).
   */
  const mimeTypeToExtension = useCallback((mimeType: string): string => {
    if (mimeType.includes('webm')) return '.webm';
    return '.mp4';
  }, []);

  // Process audio through pipeline
  const processAudioPipeline = useCallback(async (audioBlob: Blob) => {
    isProcessingRef.current = true;
    setIsProcessing(true);
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    try {
      // Step 1: Speech-to-Text (Whisper)
      const sttFormData = new FormData();
      const mimeType = mediaMimeTypeRef.current;
      const extension = mimeTypeToExtension(mimeType);
      const audioFile = new File([audioBlob], `command${extension}`, { type: mimeType });

      // ── Diagnostic: confirm what we're sending ────────────────────────
      console.log('[VoiceCommand] STT dispatch:', {
        blobSize: audioBlob.size,
        mimeType,
        fileName: audioFile.name,
        fileSize: audioFile.size,
        fileType: audioFile.type,
      });

      sttFormData.append('file', audioFile);

      const sttResponse = await fetch('/api/ai/stt', {
        method: 'POST',
        body: sttFormData,
        signal,
      });

      if (!sttResponse.ok) {
        const errorData = await sttResponse.json();
        throw new Error(`STT failed: ${sttResponse.status} - ${errorData.error}`);
      }

      const { text } = await sttResponse.json() as SttResponse;
      setTranscript(text);
      onTranscript?.(text);

      if (skipAIPipeline) {
        return;
      }

      if (!resellerId || resellerId.includes('[') || resellerId.includes(']') || resellerId.includes('%5B')) {
        console.warn('[VoiceCommand] Skipping AI pipeline - invalid resellerId:', resellerId);
        return;
      }

      const currentContext = tenantContextRef.current || {};
      const processResponse = await fetch('/api/ai/process-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resellerId: resellerId.trim(),
          userCommand: text,
          currentConfig: _currentConfig || {},
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
      onAIResponse?.(aiText);

      // Step 3: Text-to-Speech (Orpheus) — read fresh context from refs
      const currentTtsContext = tenantContextRef.current || {};
      const currentResellerId = resellerIdRef.current || '';
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

      const audioBuffer = await ttsResponse.arrayBuffer();
      setIsSpeaking(true);

      if (ttsAudioContextRef.current?.state !== 'closed') {
        ttsAudioContextRef.current?.close();
      }
      if (ttsAudioSourceRef.current) {
        try {
          ttsAudioSourceRef.current.stop();
          ttsAudioSourceRef.current.disconnect();
        } catch {
          // Ignore errors during cleanup
        }
      }

      const AudioContextCtor = getAudioContextConstructor();
      const audioContext = new AudioContextCtor();
      ttsAudioContextRef.current = audioContext;

      const audioSource = audioContext.createBufferSource();
      ttsAudioSourceRef.current = audioSource;

      const audioBufferData = await audioContext.decodeAudioData(audioBuffer);
      audioSource.buffer = audioBufferData;
      audioSource.connect(audioContext.destination);

      audioSource.onended = () => {
        setIsSpeaking(false);
        try {
          audioSource.stop();
          audioSource.disconnect();
        } catch {
          // Ignore errors during cleanup
        }
        audioContext.close();
        ttsAudioSourceRef.current = null;
        ttsAudioContextRef.current = null;
      };

      audioSource.start();

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
  }, [onTranscript, onAIResponse, onError, skipAIPipeline, resellerId, _currentConfig, getAudioContextConstructor, mimeTypeToExtension]);

  // Start listening
  const startListening = useCallback(async () => {
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

        // 4. Size guard — sub-1024-byte blobs are not valid media containers
        if (audioBlob.size < 1024) {
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
          mediaRecorderRef.current.requestData();
          mediaRecorderRef.current.stop();
          setIsListening(false);
          // Notify caller so the UI can surface feedback (e.g. TTS or toast)
          onMaxDuration?.();
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
  const deactivateVoice = useCallback(() => {
    if (!voiceActive) return; // Already inactive — no-op
    clearVoiceActiveTimeout();
    stopListening();
    setVoiceActive(false);
  }, [voiceActive, clearVoiceActiveTimeout, stopListening]);

  // Keep deactivateVoiceRef synced so the timeout can call it without deps
  useEffect(() => {
    deactivateVoiceRef.current = deactivateVoice;
  }, [deactivateVoice]);

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
    startListening,
    stopListening,
    abort,
    // NEW explicit activation API
    voiceActive,
    activateVoice,
    deactivateVoice,
  };
}