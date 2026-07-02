/**
 * @file voice-parser.ts
 *
 * ZEEDER Voice Type Declarations
 *
 * TypeScript declarations for the Web Speech API (SpeechRecognition).
 * These are not included in the default `lib: ["dom"]` for all browsers,
 * so we provide them here for type-safety.
 *
 * @remarks
 * This module is intentionally **zero-dependency** with respect to the
 * reseller domain.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Constructor signature for SpeechRecognition (standard + webkit prefix).
 */
export interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

/**
 * Minimal SpeechRecognition instance interface covering the subset
 * of the API used by SystemMicButton.
 */
export interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

/**
 * Shape of the result event emitted by SpeechRecognition.
 */
export interface SpeechRecognitionResultEvent {
  results: SpeechRecognitionResultList;
}

/**
 * Shape of the error event emitted by SpeechRecognition.
 */
export interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

/**
 * Shape of the transcript list emitted by SpeechRecognition.
 */
export interface SpeechRecognitionResultList {
  item(index: number): SpeechRecognitionResult;
  length: number;
  [index: number]: SpeechRecognitionResult;
}

/**
 * Shape of a single transcript result emitted by SpeechRecognition.
 */
export interface SpeechRecognitionResult {
  isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}

/**
 * Shape of a single transcript alternative emitted by SpeechRecognition.
 */
export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

/**
 * Enumeration of industry categories resolved by the voice parser.
 */
export type VoiceParseCategory =
  | 'AUTOMOTIVE_ELITE'
  | 'RETAIL_STANDARD'
  | 'GENERAL';

/**
 * Confidence metadata produced by the voice parser.
 */
export interface VoiceParseMeta {
  /** True if the parser split the input on a known delimiter. */
  parserFoundDelimiters: boolean;
  /** Confidence score between 0 and 1. */
  confidence: number;
}

/**
 * Structured result returned by `parseVoiceEntry`.
 */
export interface VoiceParseResult {
  /** Extracted client name. */
  name: string;
  /** Raw industry string extracted from the transcription. */
  industry: string;
  /** Resolved industry category. */
  category: VoiceParseCategory;
  /** Parser metadata. */
  meta: VoiceParseMeta;
}

/**
 * Shape of the error event emitted by SpeechRecognition.
 */
export interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

/**
 * Detect whether the Web Speech API is available in the current browser.
 * Returns the constructor (standard or webkit-prefixed) or null.
 */
export function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;

  const w = window as unknown as Record<string, any>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionConstructor | null;
}