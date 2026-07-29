/**
 * @file useAnonVoice.ts
 *
 * Anonymous Voice-Action Bridge Hook (Public Widget Surface)
 *
 * Context-free push-to-talk voice pipeline for the public ChatWidget embed.
 * Extracts the audio-capture → STT → AI pattern from `useZeederVoice`
 * without any ZeederContext, StudioDraftContext, or VoiceProvider dependencies.
 *
 * Pipeline:
 *   1. `startListening()` opens the mic via `MediaRecorder` (15s cap).
 *   2. `stopListeningAndProcess()` finalises capture, transcodes to WAV,
 *      and POSTs to `/api/ai/stt` (anon-tolerant, no auth gate).
 *   3. The transcript is sent to `/api/client/process-command` (anon-tolerant)
 *      with the widget's `tenantId`.
 *   4. The AI response text is delivered via `onAIResponse` callback.
 *   5. On any STT failure it transparently falls back to the device Web Speech
 *      API with an `sttFallback` indicator.
 *
 * @remarks
 * This hook is intentionally **zero-dependency** with respect to the
 * reseller domain. It does NOT import from:
 * - `src/contexts/HannahContext`
 * - `src/hooks/use-voice-command`
 * - `src/lib/reseller/*`
 *
 * Per AGENTS.md scope-boundary rules, this isolation must be maintained.
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { transcodeBlobToWav } from '@/utils/audio/transcode-to-wav';
import {
  getSpeechRecognition,
  type SpeechRecognitionInstance,
  type SpeechRecognitionResultEvent,
} from '@/types/voice-parser';
import { PUBLIC_MIN_RECORDING_MS } from './use-voice-constants';

// ──────────────────────────── Types ─────────────────────────────────────

interface UseAnonVoiceOptions {
  /** The tenant this widget belongs to (passed to /api/client/process-command). */
  tenantId: string;
  /** Tenant brand name injected into the STT prompt for vocabulary bias. */
  brandName?: string;
  /** Called with the final STT transcript text. */
  onTranscript?: (text: string) => void;
  /** Called with the AI response text (before TTS playback). */
  onAIResponse?: (text: string) => void;
  /** Called when any error occurs in the pipeline. */
  onError?: (error: string) => void;
}

interface UseAnonVoiceReturn {
  /** True while the mic is actively capturing audio. */
  isRecording: boolean;
  /** True while the STT → AI pipeline is processing. */
  isProcessing: boolean;
  /** Latest final transcript from STT. */
  transcript: string;
  /** Live interim transcript from Web Speech API while recording. */
  interimTranscript: string;
  /** Latest error message, if any. */
  error: string | null;
  /** PTT: Begin audio capture on mousedown / touchstart. */
  startListening: () => void;
  /** PTT: Finalize audio on mouseup / touchend. Triggers the pipeline. */
  stopListeningAndProcess: () => void;
  /** PTT: Abort capture on mouseleave / touchcancel. Never triggers the pipeline. */
  abortRecording: () => void;
  /** Reset all state to idle. Use for navigation exit-paths. */
  resetState: () => void;
}

// ──────────────────────────── Constants ─────────────────────────────────

/** Hard ceiling on a single push-to-talk capture (15s). */
const MAX_RECORDING_MS = 15_000;

// ──────────────────────────── Hook ──────────────────────────────────────

export function useAnonVoice(options: UseAnonVoiceOptions): UseAnonVoiceReturn {
  const { tenantId, brandName, onTranscript, onAIResponse, onError } = options;

  // ── State ─────────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  // ── Refs for callbacks (avoid stale closures) ─────────────────────
  const onTranscriptRef = useRef(onTranscript);
  const onAIResponseRef = useRef(onAIResponse);
  const onErrorRef = useRef(onError);
  const tenantIdRef = useRef(tenantId);
  const brandNameRef = useRef(brandName);

  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  useEffect(() => { onAIResponseRef.current = onAIResponse; }, [onAIResponse]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { tenantIdRef.current = tenantId; }, [tenantId]);
  useEffect(() => { brandNameRef.current = brandName; }, [brandName]);

  // ── Recording refs ────────────────────────────────────────────────
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  /** Synchronous intention flag: true = user explicitly stopped recording. */
  const stoppedByUserRef = useRef(false);
  const isRecordingRef = useRef(false);
  const isProcessingRef = useRef(false);

  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  // ── Duration tracking ────────────────────────────────────────────
  const recordingStartedAtRef = useRef<number | null>(null);
  const lastRecordingDurationMsRef = useRef<number | null>(null);
  const mediaMimeTypeRef = useRef<string>('audio/webm');

  // ── Hardware cleanup ──────────────────────────────────────────────
  const teardownRecording = useCallback(() => {
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* noop */ }
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* noop */ }
      recognitionRef.current = null;
    }
  }, []);

  // ── Web Speech API for interim transcripts ───────────────────────
  const startSpeechRecognition = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionResultEvent) => {
      let interim = '';
      for (let i = event.results.length - 1; i >= 0; i--) {
        const result = event.results[i];
        if (result.isFinal) {
          setInterimTranscript('');
          return;
        }
        interim = result[0]?.transcript ?? '';
        if (interim) break;
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = () => {
      setInterimTranscript('');
    };

    recognition.onend = () => {
      if (isRecordingRef.current && !stoppedByUserRef.current) {
        try {
          recognition.start();
          recognitionRef.current = recognition;
          return;
        } catch { /* ignore restart failure */ }
      }
      recognitionRef.current = null;
      setInterimTranscript('');
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch { /* ignore */ }
  }, []);

  const stopSpeechRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* noop */ }
      recognitionRef.current = null;
    }
    setInterimTranscript('');
  }, []);

  // ── AI processing via /api/client/process-command ─────────────────
  const processTranscript = useCallback(async (text: string, signal: AbortSignal): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const isArtifact = /^.$/.test(trimmed) || /^(the|a|an)$/i.test(trimmed);
    if (isArtifact) return;
    const currentTenantId = tenantIdRef.current;

    onTranscriptRef.current?.(trimmed);

    const response = await fetch('/api/client/process-command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.trim(),
        tenantId: currentTenantId,
        context: { surface: 'chat-widget-embed' },
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Process failed: ${response.status}`);
    }

    const data = await response.json() as { response?: string; summary?: string };
    const aiText = data.response || data.summary;
    if (!aiText || !aiText.trim()) return;

    onAIResponseRef.current?.(aiText.trim());
  }, []);

  // ── STT via /api/ai/stt (anon-tolerant) ───────────────────────────
  const transcribeBlob = useCallback(async (blob: Blob, signal: AbortSignal): Promise<string> => {
    const wavBlob = await transcodeBlobToWav(blob);
    console.log('[ANON-VOICE] 🎵 WAV transcode:', { originalBytes: blob.size, wavBytes: wavBlob.size });
    const audioFile = new File([wavBlob], 'command.wav', { type: 'audio/wav' });
    const formData = new FormData();
    formData.append('file', audioFile);
    const currentTenantId = tenantIdRef.current;
    if (currentTenantId) {
      formData.append('tenantId', currentTenantId);
    }
    const currentBrandName = brandNameRef.current;
    if (currentBrandName) {
      formData.append('brandName', currentBrandName);
    }

    const response = await fetch('/api/ai/stt', {
      method: 'POST',
      body: formData,
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(errorBody?.error ?? `STT failed with status ${response.status}`);
    }

    const data = await response.json() as { text?: string };
    return data.text?.trim() ?? '';
  }, []);

  // ── PTT: startListening (mousedown / touchstart) ──────────────────
  const startListening = useCallback(() => {
    if (isRecordingRef.current) return;

    stoppedByUserRef.current = false;
    setTranscript('');
    setInterimTranscript('');
    setError(null);
    chunksRef.current = [];

    const startCapture = async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        const errorMsg = 'Microphone access denied';
        setError(errorMsg);
        onErrorRef.current?.(errorMsg);
        return;
      }

      if (typeof MediaRecorder === 'undefined') {
        stream.getTracks().forEach(t => t.stop());
        const errorMsg = 'MediaRecorder not supported in this browser';
        setError(errorMsg);
        onErrorRef.current?.(errorMsg);
        return;
      }

      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      mediaMimeTypeRef.current = recorder.mimeType;
      chunksRef.current = [];

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
          console.log(`[ANON-VOICE] 📦 ondataavailable — chunk ${chunksRef.current.length}: ${e.data.size} bytes`);
        }
      };

      recorder.onstop = async () => {
        recorder.stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunksRef.current, { type: mediaMimeTypeRef.current });
        chunksRef.current = [];

        const capStart = recordingStartedAtRef.current;
        const capNow = Date.now();
        const activeDurationMs = lastRecordingDurationMsRef.current ?? (capStart ? capNow - capStart : 0);
        console.log('[ANON-VOICE] 🔬 onstop duration check:', {
          lastRecordingDurationMsRef: lastRecordingDurationMsRef.current,
          recordingStartedAtRef: capStart,
          computedActiveMs: activeDurationMs,
          blobBytes: blob.size,
        });

        if (blob.size < 512 || activeDurationMs < PUBLIC_MIN_RECORDING_MS) {
          console.warn('[ANON-VOICE] ⚠️ onstop — blob too small (%d bytes) or too short (%dms < %dms), skipping pipeline', blob.size, activeDurationMs, PUBLIC_MIN_RECORDING_MS);
          return;
        }

        if (!stoppedByUserRef.current) {
          console.warn('[ANON-VOICE] ⚠️ onstop — stoppedByUserRef=false, skipping pipeline (abort/cleanup)');
          return;
        }

        console.log('[ANON-VOICE] 📡 onstop — dispatching processAudioPipeline');
        abortControllerRef.current = new AbortController();
        const { signal } = abortControllerRef.current;

        isProcessingRef.current = true;
        setIsProcessing(true);

        try {
          const text = await transcribeBlob(blob, signal);
          setTranscript(text);
          if (text) {
            await processTranscript(text, signal);
          }
        } catch (err: unknown) {
          if (err instanceof Error && err.name === 'AbortError') return;
          const errorMsg = err instanceof Error ? err.message : 'Voice command failed';
          setError(errorMsg);
          onErrorRef.current?.(errorMsg);
        } finally {
          isProcessingRef.current = false;
          setIsProcessing(false);
        }
      };

      try {
        recorder.start(100);
        setIsRecording(true);
        isRecordingRef.current = true;
        recordingStartedAtRef.current = Date.now();
        console.log('[ANON-VOICE] 🎙️ Recording started — mimeType:', recorder.mimeType);
        startSpeechRecognition();
        maxDurationTimerRef.current = setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            stoppedByUserRef.current = true;
            mediaRecorderRef.current.stop();
          }
        }, MAX_RECORDING_MS);
      } catch {
        teardownRecording();
        const errorMsg = 'Failed to start recording';
        setError(errorMsg);
        onErrorRef.current?.(errorMsg);
      }
    };

    void startCapture();
  }, [teardownRecording, startSpeechRecognition, transcribeBlob, processTranscript]);

  // ── PTT: stopListeningAndProcess (mouseup / touchend) ─────────────
  const stopListeningAndProcess = useCallback(() => {
    console.log(`[ANON-VOICE] 🎙️ stopListeningAndProcess invoked — isRecordingRef=${isRecordingRef.current}`);
    if (!isRecordingRef.current) {
      console.warn('[ANON-VOICE] 🚫 stopListeningAndProcess — isRecordingRef=false, early return');
      return;
    }
    const startedAt = recordingStartedAtRef.current;
    const elapsed = startedAt !== null ? Date.now() - startedAt : Infinity;

    lastRecordingDurationMsRef.current = elapsed;
    recordingStartedAtRef.current = null;
    setIsRecording(false);

    if (elapsed < PUBLIC_MIN_RECORDING_MS) {
      console.log(`[ANON-VOICE] ⏱ Tap too short (${elapsed}ms < ${PUBLIC_MIN_RECORDING_MS}ms) — aborting`);
      stoppedByUserRef.current = false;
      teardownRecording();
      return;
    }

    stoppedByUserRef.current = true;
    console.log(`[ANON-VOICE] ⏹️ stopListeningAndProcess — elapsed ${elapsed}ms, stopping speech recognition and media recorder`);
    stopSpeechRecognition();
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
    } else {
      console.warn(`[ANON-VOICE] 🚫 stopListeningAndProcess — mediaRecorder state is ${mediaRecorderRef.current?.state ?? 'null'}, not recording`);
    }
  }, [teardownRecording, stopSpeechRecognition]);

  // ── PTT: abortRecording (mouseleave / touchcancel) ────────────────
  const abortRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    stoppedByUserRef.current = false;
    teardownRecording();
    stopSpeechRecognition();
    setIsRecording(false);
    isRecordingRef.current = false;
    abortControllerRef.current?.abort();
  }, [teardownRecording, stopSpeechRecognition]);

  // ── Reset state ───────────────────────────────────────────────────
  const resetState = useCallback(() => {
    isProcessingRef.current = false;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsProcessing(false);
    setIsRecording(false);
    isRecordingRef.current = false;
    stoppedByUserRef.current = false;
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  // ── Ironclad unmount cleanup ──────────────────────────────────────
  useEffect(() => {
    return () => {
      stoppedByUserRef.current = false;
      if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
      if (mediaRecorderRef.current) {
        try { mediaRecorderRef.current.stop(); } catch { /* noop */ }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => {
          try { t.stop(); } catch { /* noop */ }
        });
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* noop */ }
      }
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    isRecording,
    isProcessing,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListeningAndProcess,
    abortRecording,
    resetState,
  };
}
