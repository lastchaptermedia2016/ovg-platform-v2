/**
 * @file SystemMicButton.tsx
 *
 * ZEEDER System Microphone Button
 *
 * A production-grade Push-to-Talk (PTT) UI component that integrates with
 * the ZEEDER voice-action pipeline via `useZeederVoice()`. The hook owns
 * the capture engine (MediaRecorder → secure Whisper STT, with a device
 * Web Speech fallback), so this component only orchestrates the PTT gesture
 * and reflects visual state (idle / listening / executing / error / local-fallback).
 *
 * Visual States:
 * - `idle`       : Circular gold-border button with a subtle glow.
 * - `listening`  : Solid gold background + animated "Listening..." indicator.
 * - `executing`  : Pulse-glow animation while the action pipeline is processing.
 * - `error`      : Red border + red glow when the last dispatch failed.
 * - `localFallback`: A small "Local Engine Active" badge when STT falls back
 *                    to the device Web Speech engine instead of the server pipeline.
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

import { useEffect } from 'react';
import { useZeeder } from '@/contexts/ZeederContext';
import { useZeederVoice } from '@/hooks/useZeederVoice';
import { ClientHelpModal } from '@/components/client/ClientHelpModal';

// ──────────────────────────── Constants ─────────────────────────────────

/** Duration (ms) to show the error visual state before fading back to idle. */
const ERROR_VISIBLE_DURATION_MS = 3_000;

// ──────────────────────────── Component ─────────────────────────────────

/**
 * SystemMicButton
 *
 * A circular Push-to-Talk button that:
 * 1. Starts the hook's capture engine on `mousedown` / `touchstart`.
 * 2. Stops it on `mouseup` / `mouseleave` / `touchend`.
 * 3. Reflects the ZEEDER state machine visually (idle / listening / executing / error).
 *
 * @returns A styled `<button>` element.
 */
interface SystemMicButtonProps {
  onTranscriptChange?: (text: string) => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
}

export default function SystemMicButton({ onTranscriptChange, onRecordingStateChange }: SystemMicButtonProps) {
  const { mode } = useZeeder();
  const {
    startListening,
    stopListening,
    isListening,
    isProcessing,
    transcript,
    error: voiceError,
    clearError,
    helpModalOpen,
    dismissHelpModal,
    sttFallback,
  } = useZeederVoice();

  // ── Error visual state is derived directly from voiceError ─────────
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

  // Surface the live transcript + recording state to the parent (if wired).
  useEffect(() => {
    onTranscriptChange?.(transcript);
  }, [transcript, onTranscriptChange]);

  useEffect(() => {
    onRecordingStateChange?.(isListening);
  }, [isListening, onRecordingStateChange]);

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
    <div className="relative flex flex-col items-center">
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
          w-11 h-11 md:w-11 md:h-11
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

        {/* ── Processing spinner ring (visible only while executing) ── */}
        {isExecuting && (
          <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#FFD700] animate-spin pointer-events-none" />
        )}
      </button>

      {/* ── "Listening..." label (visible only while capturing) ──── */}
      {isListening && (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[7px] md:text-[8px] tracking-[0.15em] uppercase text-[#FFD700] font-agrandir whitespace-nowrap animate-pulse">
          Listening...
        </span>
      )}

      {/* ── "Local Engine Active" badge (visible only on Web Speech fallback) ──── */}
      {sttFallback && !isListening && (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[7px] md:text-[8px] tracking-[0.12em] uppercase text-amber-300 font-agrandir whitespace-nowrap">
          Local Engine Active
        </span>
      )}

      {/* ── SYSTEM_HELP elevated to a visual UI modal ──────────── */}
      <ClientHelpModal open={helpModalOpen} onClose={dismissHelpModal} />
    </div>
  );
}
