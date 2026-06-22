"use client";

import { useCallback } from "react";
import { useHannah } from "@/contexts/HannahContext";

function triggerHapticFeedback(): void {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(30);
  }
}

export function HannahMicAnchor() {
  const { isRecording, isProcessing, startListening, stopListeningAndProcess } =
    useHannah();

  const handleMouseDown = useCallback(() => {
    startListening().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[HannahMicAnchor] startListening failed:', msg);
    });
  }, [startListening]);

  const handleMouseUp = useCallback(() => {
    stopListeningAndProcess();
  }, [stopListeningAndProcess]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      triggerHapticFeedback();
      handleMouseDown();
    },
    [handleMouseDown],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      handleMouseUp();
    },
    [handleMouseUp],
  );

  const handleTouchCancel = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      handleMouseUp();
    },
    [handleMouseUp],
  );

  const isActive = isRecording || isProcessing;

  return (
    <button
      type="button"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      aria-label="Push to talk"
      className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full backdrop-blur-md bg-slate-950/80 border flex items-center justify-center cursor-pointer touch-none select-none active:scale-95 duration-75 transition-transform ${
        isActive
          ? "border-[#00e5ff] shadow-[0_0_25px_rgba(0,229,255,0.4)]"
          : "border-[#00e5ff]/30 shadow-[0_0_15px_rgba(0,229,255,0.15)]"
      }`}
    >
      {isRecording && (
        <span className="absolute inset-0 rounded-full bg-[#00e5ff]/20 animate-ping" />
      )}
      <svg
        viewBox="0 0 24 24"
        className={`w-6 h-6 transition-all duration-300 ${isActive ? "text-[#00e5ff]" : "text-[#00e5ff]"}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    </button>
  );
}