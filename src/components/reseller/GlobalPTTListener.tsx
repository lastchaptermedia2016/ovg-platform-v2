'use client';

import { useEffect } from 'react';
import { useHannah } from '@/contexts/HannahContext';

export function GlobalPTTListener() {
  const { isRecording, isProcessing, isSpeaking, startListening, stopListeningAndProcess, abortRecording } = useHannah();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if user is typing in an input field
      const target = event.target as HTMLElement;
      const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isInputFocused) return;

      // Global PTT: Space bar triggers recording
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        if (!isRecording && !isProcessing && !isSpeaking) {
          startListening();
        }
      }

      // Escape aborts any active operation
      if (event.key === 'Escape' && (isRecording || isProcessing || isSpeaking)) {
        event.preventDefault();
        abortRecording();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      // Skip if user is typing in an input field
      const target = event.target as HTMLElement;
      const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isInputFocused) return;

      // Global PTT: Space bar release stops recording
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        if (isRecording) {
          stopListeningAndProcess();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isRecording, isProcessing, isSpeaking, startListening, stopListeningAndProcess, abortRecording]);

  return null;
}