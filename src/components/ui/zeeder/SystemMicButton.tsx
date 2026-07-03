/**
 * @file SystemMicButton.tsx
 *
 * ZEEDER System Microphone Button
 *
 * A production-grade Push-to-Talk (PTT) UI component that integrates with
 * the ZEEDER voice-action pipeline. It uses the Web Speech API for
 * client-side speech recognition and dispatches the resulting transcript
 * through `useZeederVoice()` → `/api/ai/process-command` → `ZeederContext.dispatch()`.
 *
 * Visual States:
 * - `idle`       : Circular gold-border button with a subtle glow.
 * - `listening`  : Solid gold background + animated "Listening..." indicator.
 * - `executing`  : Pulse-glow animation while the action pipeline is processing.
 * - `error`      : Red border + red glow when the last dispatch failed.
 *
 * @remarks
 * This component is intentionally **zero-dependency** with respect to the
 * reseller domain. It does NOT import from:
 * - `src/contexts/HannahContext`
 * - `src/hooks/use-voice-command`
 * - `src/lib/reseller/*`
 *
 * @example
 * ```tsx
 * <SystemMicButton />
 * ```
 */

'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useZeeder } from '@/contexts/ZeederContext';
import { useZeederVoice } from '@/hooks/useZeederVoice';
import { getSpeechRecognition, type SpeechRecognitionInstance, type SpeechRecognitionResultEvent, type SpeechRecognitionErrorEvent } from '@/types/voice-parser';

// ──────────────────────────── Constants ─────────────────────────────────

/** Duration (ms) to show the error visual state before fading back to idle. */
const ERROR_VISIBLE_DURATION_MS = 3_000;

// ──────────────────────────── Component ─────────────────────────────────

/**
 * SystemMicButton
 *
 * A circular Push-to-Talk button that:
 * 1. Starts the Web Speech API on `mousedown`.
 * 2. Stops recognition on `mouseup` / `mouseleave`.
 * 3. Sends the transcript through `useZeederVoice().handleVoiceCommand()`.
 * 4. Reflects the ZEEDER state machine visually (idle / listening / executing / error).
 *
 * @returns A styled `<button>` element.
 */
export default function SystemMicButton() {
  const { mode } = useZeeder();
  const { handleVoiceCommand, isProcessing, error: voiceError, clearError } = useZeederVoice();

  // ── Local state ────────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false);

  // Refs for speech recognition lifecycle
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const transcriptRef = useRef('');

  // ── Error visual state is derived directly from voiceError ─────────
  // No separate hasError state needed — avoids setState-in-effect linter
  // violations. The hook's clearError() will be called from the UI or
  // by a future caller.
  const hasError = voiceError !== null;

  // Auto-clear error after a timeout — runs as a side-effect subscription
  // using setTimeout in a callback that calls clearError, not setState.
  useEffect(() => {
    if (!voiceError) return undefined;
    const timer = setTimeout(() => {
      clearError();
    }, ERROR_VISIBLE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [voiceError, clearError]);

  // ── Cleanup on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* noop */ }
        recognitionRef.current = null;
      }
    };
  }, []);

  // ── Start speech recognition ───────────────────────────────────────
  const startListening = useCallback(() => {
    // Guard: prevent overlapping sessions
    if (isListening || isProcessing) return;

    const SpeechRecognitionAPI = getSpeechRecognition();

    if (!SpeechRecognitionAPI) {
      console.warn('[ZEEDER-VOICE] Web Speech API not available in this browser.');
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionResultEvent) => {
      const results = event.results;
      console.log('[TRACE] SpeechRecognitionResult:', {
        resultsLength: results.length,
        result0Length: results[0]?.length,
        transcript: results[0]?.[0]?.transcript,
      });
      if (results.length > 0 && results[0].length > 0 && results[0][0].transcript) {
        transcriptRef.current = results[0][0].transcript.trim();
        console.log('[TRACE] Transcript stored:', `"${transcriptRef.current}"`);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[ZEEDER-VOICE] Speech recognition error:', event.error ?? 'unknown');
      setIsListening(false);
    };

    recognition.onend = () => {
      console.log('[ZEEDER-VOICE] Speech recognition ended');
      setIsListening(false);
      const transcript = transcriptRef.current;
      console.log('[ZEEDER-VOICE] Transcript captured:', transcript ? `"${transcript}"` : '(empty)');
      transcriptRef.current = '';

      if (transcript) {
        console.log('[ZEEDER-VOICE] Calling handleVoiceCommand with transcript');
        handleVoiceCommand(transcript);
      } else {
        console.warn('[ZEEDER-VOICE] No transcript captured, not calling handleVoiceCommand');
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
      transcriptRef.current = '';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start speech recognition.';
      console.error('[ZEEDER-VOICE]', message);
      setIsListening(false);
    }
  }, [isListening, isProcessing, handleVoiceCommand]);

  // ── Stop speech recognition ────────────────────────────────────────
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* noop */ }
      recognitionRef.current = null;
    }
  }, []);

  // ── Determine visual state ─────────────────────────────────────────
  const isExecuting = isProcessing || mode === 'executing';

  // ── CSS class computation ──────────────────────────────────────────
  const borderColor = hasError
    ? 'border-red-500'
    : 'border-[#FFD700]';

  const bgColor = isListening
    ? 'bg-[#FFD700]'
    : 'bg-transparent';

  const glowClass = isExecuting
    ? 'zeeder-pulse-animation'
    : isListening
      ? 'shadow-[0_0_16px_rgba(255,215,0,0.8)]'
      : hasError
        ? 'shadow-[0_0_12px_rgba(239,68,68,0.6)]'
        : 'shadow-[0_0_6px_rgba(255,215,0,0.25)]';

  const iconColor = isListening ? 'text-black' : 'text-[#FFD700]';

  return (
    <button
      type="button"
      onMouseDown={startListening}
      onMouseUp={stopListening}
      onMouseLeave={stopListening}
      onTouchStart={startListening}
      onTouchEnd={stopListening}
      disabled={isExecuting}
      aria-label={
        isListening
          ? 'Listening for voice command'
          : isExecuting
            ? 'Processing voice command'
            : hasError
              ? 'Voice command error — try again'
              : 'Push to talk'
      }
      aria-pressed={isListening}
      className={`
        relative flex items-center justify-center
        w-10 h-10 md:w-11 md:h-11
        rounded-full
        border ${borderColor}
        ${bgColor}
        ${glowClass}
        transition-all duration-300 ease-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD700]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950
        disabled:opacity-60 disabled:cursor-not-allowed
        cursor-pointer select-none
        font-agrandir
      `}
    >
      {/* ── Mic Icon ─────────────────────────────────────────────── */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`w-4 h-4 md:w-[18px] md:h-[18px] ${iconColor} transition-colors duration-300`}
        aria-hidden="true"
      >
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>

      {/* ── "Listening..." label (visible only while capturing) ──── */}
      {isListening && (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[7px] md:text-[8px] tracking-[0.15em] uppercase text-[#FFD700] font-agrandir whitespace-nowrap animate-pulse">
          Listening...
        </span>
      )}

      {/* ── Processing spinner ring (visible only while executing) ── */}
      {isExecuting && (
        <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#FFD700] animate-spin pointer-events-none" />
      )}
    </button>
  );
}