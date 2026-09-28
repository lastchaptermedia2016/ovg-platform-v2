/**
 * Compatibility shim — the transcoder implementation moved to
 * `src/lib/voice/transcoder.ts` (Phase 5 directive). Existing importers
 * (`useZeederVoice`, `useAnonVoice`, `use-voice-command`) keep working
 * unchanged through this re-export.
 */
export * from '@/lib/voice/transcoder';
