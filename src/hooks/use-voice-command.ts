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
}

interface TenantContext {
  tenantId?: string;
  category?: string;
}

interface ProcessResponse {
  response: string;
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
}

export function useVoiceCommand(options: VoiceCommandOptions = {}): UseVoiceCommandReturn {
  const {
    silenceThreshold = 0.02,
    silenceDuration = 3000,
    forcedContinuousMode = false,
    resellerId,
    tenantContext = {},
    currentConfig: _currentConfig,
    skipAIPipeline = false,
    onTranscript,
    onAIResponse,
    onError,
  } = options;

  // State
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Refs for audio handling
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
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

  // Ref indirection to break circular deps between monitorVolume and stopListening
  const stopListeningRef = useRef<() => void>(() => {});
  // Ref indirection for monitorVolume to avoid self-referencing in requestAnimationFrame
  const monitorVolumeRef = useRef<() => void>(() => {});

  const getAudioContextConstructor = useCallback((): typeof AudioContext => {
    if (typeof AudioContext !== 'undefined') return AudioContext;
    if (typeof window !== 'undefined' && 'webkitAudioContext' in window) {
      return (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    }
    return AudioContext;
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
  }, [cleanup]);

  // Monitor volume levels - uses ref for stopListening to avoid circular deps
  const monitorVolume = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const normalizedVolume = average / 255;
    setVolumeLevel(normalizedVolume);

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

    animationFrameRef.current = requestAnimationFrame(() => {
      monitorVolumeRef.current();
    });
  }, [silenceThreshold, silenceDuration, forcedContinuousMode]);

  useEffect(() => {
    monitorVolumeRef.current = monitorVolume;
  }, [monitorVolume]);

  // Stop listening and process
  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsListening(false);
    cleanup();
  }, [cleanup]);

  // Keep stopListeningRef synced outside render via useEffect
  useEffect(() => {
    stopListeningRef.current = stopListening;
  }, [stopListening]);

  // Process audio through pipeline
  const processAudioPipeline = useCallback(async (audioBlob: Blob) => {
    isProcessingRef.current = true;
    setIsProcessing(true);
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    try {
      // Step 1: Speech-to-Text (Whisper)
      const sttFormData = new FormData();
      const audioFile = new File([audioBlob], 'command.webm', { type: 'audio/webm' });
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

      const processResponse = await fetch('/api/ai/process-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resellerId: resellerId.trim(),
          userCommand: text,
          currentConfig: _currentConfig || {},
          tenantContext: {
            tenantId: tenantContext.tenantId,
            category: tenantContext.category || 'GENERAL',
          },
        }),
        signal,
      });

      if (!processResponse.ok) {
        throw new Error(`Process failed: ${processResponse.status}`);
      }

      const { response: aiText } = await processResponse.json() as ProcessResponse;
      setAiResponse(aiText);
      onAIResponse?.(aiText);

      // Step 3: Text-to-Speech (Orpheus)
      const ttsResponse = await fetch('/api/ai/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiText, voice: 'daniel' }),
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
  }, [onTranscript, onAIResponse, onError, skipAIPipeline, resellerId, _currentConfig, tenantContext.tenantId, tenantContext.category, getAudioContextConstructor]);

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

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4',
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size > 0) {
          await processAudioPipeline(audioBlob);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);

      setIsListening(true);
      monitorVolumeRef.current();

    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to access microphone';
      setError(errorMsg);
      onError?.(errorMsg);
      cleanup();
    }
  }, [processAudioPipeline, cleanup, onError, getAudioContextConstructor]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (_e: KeyboardEvent) => {
      if (_e.key === 'Escape' && (isListening || isProcessing || isSpeaking)) {
        abort();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isListening, isProcessing, isSpeaking, abort]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

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
  };
}