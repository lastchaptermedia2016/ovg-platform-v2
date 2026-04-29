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

interface VoiceCommandOptions {
  silenceThreshold?: number;
  silenceDuration?: number;
  onTranscript?: (text: string) => void;
  onAIResponse?: (text: string) => void;
  onError?: (error: string) => void;
}

export function useVoiceCommand(options: VoiceCommandOptions = {}): UseVoiceCommandReturn {
  const {
    silenceThreshold = 0.02,
    silenceDuration = 1800, // 1.8 seconds
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

  // Cleanup function
  const cleanup = useCallback(() => {
    // Stop media recorder
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }
    mediaRecorderRef.current = null;

    // Stop audio context
    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;

    // Stop all tracks
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;

    // Clear timers
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Abort any ongoing fetch
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    // Reset volume
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

  // Monitor volume levels
  const monitorVolume = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate average volume
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const normalizedVolume = average / 255; // Normalize to 0-1
    setVolumeLevel(normalizedVolume);

    // Check silence threshold
    if (normalizedVolume < silenceThreshold) {
      if (!silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          stopListening();
        }, silenceDuration);
      }
    } else {
      // Reset silence timer if volume detected
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    }

    // Continue monitoring
    animationFrameRef.current = requestAnimationFrame(monitorVolume);
  }, [silenceThreshold, silenceDuration]);

  // Stop listening and process
  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsListening(false);
    cleanup();
  }, [cleanup]);

  // Process audio through pipeline
  const processAudioPipeline = useCallback(async (audioBlob: Blob) => {
    setIsProcessing(true);
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    try {
      // Step 1: Speech-to-Text (Whisper)
      const sttFormData = new FormData();
      sttFormData.append('audio', audioBlob, 'recording.webm');

      const sttResponse = await fetch('/api/stt', {
        method: 'POST',
        body: sttFormData,
        signal,
      });

      if (!sttResponse.ok) {
        throw new Error(`STT failed: ${sttResponse.status}`);
      }

      const { text } = await sttResponse.json();
      setTranscript(text);
      onTranscript?.(text);

      // Step 2: Process with AI (Llama)
      const processResponse = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal,
      });

      if (!processResponse.ok) {
        throw new Error(`Process failed: ${processResponse.status}`);
      }

      const { response: aiText } = await processResponse.json();
      setAiResponse(aiText);
      onAIResponse?.(aiText);

      // Step 3: Text-to-Speech (Orpheus)
      const ttsResponse = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiText }),
        signal,
      });

      if (!ttsResponse.ok) {
        throw new Error(`TTS failed: ${ttsResponse.status}`);
      }

      const audioBuffer = await ttsResponse.arrayBuffer();
      
      // Play audio
      setIsSpeaking(true);
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioSource = audioContext.createBufferSource();
      const audioBufferData = await audioContext.decodeAudioData(audioBuffer);
      
      audioSource.buffer = audioBufferData;
      audioSource.connect(audioContext.destination);
      
      audioSource.onended = () => {
        setIsSpeaking(false);
        audioContext.close();
      };
      
      audioSource.start();

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Voice command aborted');
        return;
      }
      const errorMsg = err.message || 'Voice command failed';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  }, [onTranscript, onAIResponse, onError]);

  // Start listening
  const startListening = useCallback(async () => {
    try {
      // Reset state
      setTranscript('');
      setAiResponse('');
      setError(null);
      setVolumeLevel(0);
      audioChunksRef.current = [];

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up audio context for volume monitoring
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Set up media recorder
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
      mediaRecorder.start(100); // Collect data every 100ms

      // Start volume monitoring
      setIsListening(true);
      monitorVolume();

    } catch (err: any) {
      const errorMsg = err.message || 'Failed to access microphone';
      setError(errorMsg);
      onError?.(errorMsg);
      cleanup();
    }
  }, [monitorVolume, processAudioPipeline, cleanup, onError]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (isListening || isProcessing || isSpeaking)) {
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
