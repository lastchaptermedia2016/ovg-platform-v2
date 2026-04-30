'use client';

import { useState, useCallback, useRef } from 'react';

interface UseResilientVoiceReturn {
  isPlaying: boolean;
  isSilentMode: boolean;
  captions: string;
  playVoice: (text: string) => Promise<void>;
  stopVoice: () => void;
  clearCaptions: () => void;
}

// Phase 1: Groq Orpheus-v1 TTS
const playGroqTTS = async (text: string): Promise<ArrayBuffer> => {
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, provider: 'groq' }),
  });

  if (!response.ok) {
    const error = new Error(`Groq TTS failed: ${response.status}`);
    (error as any).status = response.status;
    throw error;
  }

  return response.arrayBuffer();
};

// Phase 2: ElevenLabs TTS
const playElevenLabsTTS = async (text: string): Promise<ArrayBuffer> => {
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, provider: 'elevenlabs' }),
  });

  if (!response.ok) {
    const error = new Error(`ElevenLabs TTS failed: ${response.status}`);
    (error as any).status = response.status;
    throw error;
  }

  return response.arrayBuffer();
};

// Phase 3: Browser Web Speech API
const playBrowserTTS = (text: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error('Web Speech API not supported'));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Try to use a good voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
      v.name.includes('Google') || 
      v.name.includes('Samantha') || 
      v.name.includes('Alex')
    ) || voices[0];
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(new Error(`Speech synthesis failed: ${e.error}`));

    window.speechSynthesis.speak(utterance);
  });
};

// Typewriter effect for captions
const typewriterEffect = (
  text: string, 
  onUpdate: (text: string) => void, 
  speed: number = 30
): (() => void) => {
  let currentIndex = 0;
  let cancelled = false;

  const type = () => {
    if (cancelled || currentIndex >= text.length) return;
    
    onUpdate(text.slice(0, currentIndex + 1));
    currentIndex++;
    
    if (currentIndex < text.length) {
      setTimeout(type, speed);
    }
  };

  type();

  return () => { cancelled = true; };
};

export function useResilientVoice(): UseResilientVoiceReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSilentMode, setIsSilentMode] = useState(false);
  const [captions, setCaptions] = useState('');
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cancelTypewriterRef = useRef<(() => void) | null>(null);
  const isCancelledRef = useRef(false);

  const clearCaptions = useCallback(() => {
    if (cancelTypewriterRef.current) {
      cancelTypewriterRef.current();
      cancelTypewriterRef.current = null;
    }
    setCaptions('');
  }, []);

  const stopVoice = useCallback(() => {
    isCancelledRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    clearCaptions();
    setIsPlaying(false);
  }, [clearCaptions]);

  const playVoice = useCallback(async (text: string) => {
    if (!text.trim()) return;

    isCancelledRef.current = false;
    setIsPlaying(true);
    setIsSilentMode(false);
    clearCaptions();

    // Phase 1: Groq
    try {
      const audioBuffer = await playGroqTTS(text);
      if (isCancelledRef.current) return;
      
      const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);
      audioRef.current = new Audio(audioUrl);
      
      await new Promise<void>((resolve, reject) => {
        if (!audioRef.current) return reject(new Error('Audio not initialized'));
        audioRef.current.onended = () => { URL.revokeObjectURL(audioUrl); resolve(); };
        audioRef.current.onerror = () => { URL.revokeObjectURL(audioUrl); reject(new Error('Playback failed')); };
        audioRef.current.play().catch(reject);
      });

      if (!isCancelledRef.current) setIsPlaying(false);
      return;
    } catch (error: any) {
      if (isCancelledRef.current) return;
      console.log(`[Voice] Groq failed, trying browser TTS...`);
    }

    // Phase 2: Browser TTS (skip ElevenLabs since you don't have it configured)
    try {
      if (isCancelledRef.current) return;
      await playBrowserTTS(text);
      if (!isCancelledRef.current) setIsPlaying(false);
      return;
    } catch (error) {
      console.log('[Voice] Browser TTS failed, entering silent mode...');
    }

    // Phase 3: Silent captions
    if (isCancelledRef.current) return;
    setIsSilentMode(true);
    setIsPlaying(false);
    cancelTypewriterRef.current = typewriterEffect(text, (typedText) => {
      setCaptions(typedText);
    }, 40);

  }, [clearCaptions]);

  return {
    isPlaying,
    isSilentMode,
    captions,
    playVoice,
    stopVoice,
    clearCaptions,
  };
}
