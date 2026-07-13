/**
 * Cross-component signal used to suppress the VoiceProvider welcome greeting
 * when the user arrived at the studio via a voice-initiated navigation
 * (e.g. "update my branding"). This lets the originating voice command's own
 * confirmation be the only spoken output, so the two independent audio channels
 * (HTMLAudio TTS vs Web Speech `speechSynthesis`) don't overlap.
 */

let voiceNavigated = false;

/** Mark that the current navigation was triggered by a voice command. */
export function markVoiceNavigation(): void {
  voiceNavigated = true;
}

/**
 * Consume the signal. Returns `true` exactly once after a voice navigation,
 * so the greeting is skipped for that mount and subsequent (click) entries
 * greet normally.
 */
export function consumeVoiceNavigation(): boolean {
  if (voiceNavigated) {
    voiceNavigated = false;
    return true;
  }
  return false;
}
