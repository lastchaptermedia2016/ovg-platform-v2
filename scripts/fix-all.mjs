import fs from 'fs';

let h = fs.readFileSync('src/hooks/use-voice-command.ts', 'utf8');
h = h.replace(/\r\n/g, '\n');

// Fix 1: ttsPlaying in interface
h = h.replace(
  '  resetPipeline: () => void;\n}\n\n/** Minimum press duration',
  '  resetPipeline: () => void;\n  /** NEW: True while the internal TTS AudioContext is actively playing back\n   *  audio. UI consumers should gate mic re-arming on !ttsPlaying to\n   *  prevent acoustic loop / Hannah hearing her own speaker output. */\n  ttsPlaying: boolean;\n}\n\n/** Minimum press duration'
);

// Fix 2: Add ttsPlaying, networkInFlightRef, ttsPlaybackActiveRef
const boxChar = '\u2500';
const boxLine = `  // ${boxChar}${boxChar}${boxChar} NEW (PTT): Push-to-Talk state machine`;
h = h.replace(
  `  const [voiceActive, setVoiceActive] = useState(false);\n\n${boxLine}`,
  `  const [voiceActive, setVoiceActive] = useState(false);\n\n  /** NEW: Mirrors ttsPlaybackActiveRef for React consumers. */\n  const [ttsPlaying, setTtsPlaying] = useState(false);\n\n  /** NEW: True while network round-trip is in flight. Suspends idle timeout. */\n  const networkInFlightRef = useRef(false);\n\n  /** NEW: True while TTS audio plays. Blocks mic start for acoustic loop. */\n  const ttsPlaybackActiveRef = useRef(false);\n\n${boxLine}`
);

// Fix 3: MICRO_TAP_DIAGNOSTIC_BYTES
h = h.replace(
  'const MAX_RECORDING_DURATION_MS = 5_000;\n\nexport function',
  'const MAX_RECORDING_DURATION_MS = 5_000;\n\n/** Diagnostic threshold for micro-tap detection */\nconst MICRO_TAP_DIAGNOSTIC_BYTES = 12_000;\n\nexport function'
);

// Fix 4: Replace resetVoiceActiveTimeout
const rst = '  const resetVoiceActiveTimeout = useCallback(() => {';
const rend = '  }, [explicitActivation]);';
const idxS = h.indexOf(rst);
const idxE = h.indexOf(rend, idxS) + rend.length;
h = h.substring(0, idxS) + `  const resetVoiceActiveTimeout = useCallback(() => {
    if (!explicitActivation) return;
    if (networkInFlightRef.current) return;
    if (voiceActiveTimeoutRef.current) {
      clearTimeout(voiceActiveTimeoutRef.current);
    }
    voiceActiveTimeoutRef.current = setTimeout(() => {
      if (networkInFlightRef.current) return;
      onAutoDeactivateRef.current?.();
      deactivateVoiceRef.current();
    }, IDLE_TIMEOUT_MS);
  }, [explicitActivation]);` + h.substring(idxE);

// Fix 5: Add suspend/resume after clearVoiceActiveTimeout
const cf = `  // Cleanup the idle timeout
  const clearVoiceActiveTimeout = useCallback(() => {
    if (voiceActiveTimeoutRef.current) {
      clearTimeout(voiceActiveTimeoutRef.current);
      voiceActiveTimeoutRef.current = null;
    }
  }, []);

  // Cleanup function`;
const nr = `  // Cleanup the idle timeout
  const clearVoiceActiveTimeout = useCallback(() => {
    if (voiceActiveTimeoutRef.current) {
      clearTimeout(voiceActiveTimeoutRef.current);
      voiceActiveTimeoutRef.current = null;
    }
  }, []);

  // NEW: Network-aware idle-timeout suspension
  const suspendIdleTimeout = useCallback(() => {
    networkInFlightRef.current = true;
    clearVoiceActiveTimeout();
  }, [clearVoiceActiveTimeout]);

  const resumeIdleTimeout = useCallback(() => {
    networkInFlightRef.current = false;
    if (explicitActivation && voiceActive) {
      resetVoiceActiveTimeout();
    }
  }, [explicitActivation, voiceActive, resetVoiceActiveTimeout]);

  // Cleanup function`;
h = h.replace(cf, nr);

// Fix 6: Add validateAudioResponse after resumeIdleTimeout
const vc = `  // NEW: Validate audio response before decoding
  const validateAudioResponse = useCallback(
    async (response: Response, source: string):
      Promise<{ ok: true; arrayBuffer: ArrayBuffer } | { ok: false; errorMessage: string }> => {
      if (!response.ok) {
        const status = response.status;
        let msg = '' + source + ' failed: ' + status;
        try {
          const err = await response.clone().json() as Record<string, unknown>;
          if (typeof err?.error === 'string') msg = err.error;
        } catch {}
        return { ok: false, errorMessage: msg };
      }
      const ct = response.headers.get('content-type') ?? '';
      if (!ct.includes('audio/')) {
        let msg = '' + source + ' returned non-audio response (' + ct + ')';
        try {
          const err = await response.clone().json() as Record<string, unknown>;
          if (typeof err?.error === 'string') msg = err.error;
        } catch {}
        return { ok: false, errorMessage: msg };
      }
      return { ok: true, arrayBuffer: await response.arrayBuffer() };
    },
    []
  );

  // Cleanup function`;

const re = '\n  // Cleanup function';
const ri = h.lastIndexOf(re, h.indexOf('resumeIdleTimeout') + 200);
h = h.substring(0, ri) + vc;

// Fix 7: Add suspendIdleTimeout after try {
h = h.replace(
  "    try {\n\n      // \u2500\u2500 Production Excellence: Transcode webm/opus \u2192 16kHz mono WAV \u2500\u2500",
  "    try {\n      suspendIdleTimeout();\n\n      // \u2500\u2500 Production Excellence: Transcode webm/opus \u2192 16kHz mono WAV \u2500\u2500"
);

// Fix 8: resumeIdleTimeout before skipAIPipeline return
h = h.replace(
  "      if (skipAIPipeline) {\n        return;\n      }",
  "      if (skipAIPipeline) {\n        resumeIdleTimeout();\n        return;\n      }"
);

// Fix 9: resumeIdleTimeout before 'No text'
h = h.replace(
  "        console.warn('[VoiceHook] Aborting internal TTS: No text or fallback summary available.');\n        return;",
  "        console.warn('[VoiceHook] Aborting internal TTS: No text or fallback summary available.');\n        resumeIdleTimeout();\n        return;"
);

// Fix 10: Replace TTS section
const ttsIdx = h.indexOf("const ttsResponse = await fetch('/api/ai/speech'");
// Removed unused variable to satisfy eslint rule
// Removed unused variable to satisfy eslint rule
h = h.substring(0, ttsIdx) + `      const ttsResponse = await fetch('/api/ai/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: aiText.trim(),
          voice: 'hannah',
          model: 'orpheus-v1',
          metadata: {
            resellerSlug: currentResellerId.trim(),
            tenantId: currentTtsContext.tenantId,
            category: currentTtsContext.category,
          },
        }),
        signal,
      });

      // Validate audio response before decoding
      const validated = await validateAudioResponse(ttsResponse, 'TTS');
      if (!validated.ok) {
        setIsSpeaking(false);
        setTtsPlaying(false);
        resumeIdleTimeout();
        throw new Error(validated.errorMessage);
      }

      // --- Stripped-down TTS playback -------------
      setIsSpeaking(true);
      ttsPlaybackActiveRef.current = true;
      setTtsPlaying(true);

      const ttsCtx = ttsAudioContextRef.current;
      if (!ttsCtx) throw new Error('TTS AudioContext not initialized');

      // Stop any currently playing TTS
      if (ttsAudioSourceRef.current) {
        try { ttsAudioSourceRef.current.stop(); } catch {}
        ttsAudioSourceRef.current = null;
      }

      const audioBuffer = await ttsCtx.decodeAudioData(validated.arrayBuffer);

      const source = ttsCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ttsCtx.destination);

      if (ttsCtx.state === 'suspended') {
        await ttsCtx.resume();
      }

      console.log('[TTS] Playing, duration:', audioBuffer.duration, 'ctx state:', ttsCtx.state);

      source.start(0);
      ttsAudioSourceRef.current = source;

      // Single cleanup timeout --- fires after audio should be done
      const playbackMs = Math.ceil(audioBuffer.duration * 1000) + 500;
      setTimeout(() => {
        ttsPlaybackActiveRef.current = false;
        setTtsPlaying(false);
        setIsSpeaking(false);
        ttsAudioSourceRef.current = null;
        resumeIdleTimeout();
      }, playbackMs);
      // ${boxChar}${boxChar} End inner try/catch ${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}${boxChar}`;

// Fix 11: Acoustic loop guard
h = h.replace(
  "  const startListening = useCallback(async () => {\n    if (isLockedRef.current) {",
  "  const startListening = useCallback(async () => {\n    // Acoustic loop guard: block mic while TTS plays\n    if (ttsPlaybackActiveRef.current) {\n      console.warn('[VoiceCommand] TTS playback active - blocking mic start');\n      return;\n    }\n    if (isLockedRef.current) {"
);

// Fix 12: Micro-tap diagnostic
const gs = '        if (audioBlob.size < 4096) {';
const gi = h.indexOf(gs);
const ge = h.indexOf('\n        }\n', gi);
h = h.substring(0, gi) + `        if (audioBlob.size < 4096) {
          console.warn('[VoiceCommand] Blob too small (%d bytes), skipping pipeline', audioBlob.size);
          cleanup();
          return;
        }

        if (audioBlob.size < MICRO_TAP_DIAGNOSTIC_BYTES) {
          console.warn('[VoiceCommand] Micro-tap: %d bytes below %d threshold', audioBlob.size, MICRO_TAP_DIAGNOSTIC_BYTES);
        }` + h.substring(ge + 12);

// Final: add resumeIdleTimeout in catch
h = h.replace(
  '      const errorMsg = err instanceof Error ? err.message : \'Voice command failed\';',
  '      resumeIdleTimeout();\n      const errorMsg = err instanceof Error ? err.message : \'Voice command failed\';'
);

fs.writeFileSync('src/hooks/use-voice-command.ts', h);
console.log('Voice hook done.');
console.log('  validateAudioResponse:', h.includes('validateAudioResponse'));
console.log('  networkInFlightRef:', h.includes('networkInFlightRef'));
console.log('  suspendIdleTimeout:', h.includes('suspendIdleTimeout'));
console.log('  resumeIdleTimeout:', h.includes('resumeIdleTimeout'));
console.log('  ttsPlaybackActiveRef:', h.includes('ttsPlaybackActiveRef'));
console.log('  ttsPlaying:', h.includes('ttsPlaying,'));
console.log('  MICRO_TAP:', h.includes('MICRO_TAP_DIAGNOSTIC_BYTES'));

// ====== CLIENTS PAGE ======
let d = fs.readFileSync('src/app/(dashboard)/reseller/[resellerSlug]/clients/page.tsx', 'utf8');
d = d.replace(/\r\n/g, '\n');

d = d.replace(
  '  const [successRipple, setSuccessRipple] = useState(false);',
  '  const [successRipple, setSuccessRipple] = useState(false);\n  const [voiceError, setVoiceError] = useState<string | null>(null);'
);

d = d.replace(
  '  const voiceActiveRef = useRef(false);',
  '  const voiceActiveRef = useRef(false);\n  const voiceHookTtsPlayingRef = useRef(false);'
);

d = d.replace(
  "    onError: (err) => console.error('Voice command error:', err),",
  "    onError: (err) => {\n      console.error('Voice command error:', err);\n      setVoiceError(err);\n      speakVoiceRef.current(\"I didn't catch that. Please try again.\");\n    },"
);

d = d.replace(
  "  const {",
  "  useEffect(() => { if (voiceTranscript) setVoiceError(null); }, [voiceTranscript]);\n\n  const {"
);

d = d.replace(
  "    transcript: voiceTranscript,\n    voiceActive,",
  "    transcript: voiceTranscript,\n    ttsPlaying,\n    voiceActive,"
);

d = d.replace(
  "  useEffect(() => { voiceActiveRef.current = voiceActive; }, [voiceActive]);",
  "  useEffect(() => { voiceActiveRef.current = voiceActive; }, [voiceActive]);\n  useEffect(() => { voiceHookTtsPlayingRef.current = ttsPlaying; }, [ttsPlaying]);"
);

d = d.replace(
  "                    if (isVoicePlayingRef.current) return;",
  "                    if (isVoicePlayingRef.current) return;\n                    if (voiceHookTtsPlayingRef.current) return;"
);

d = d.replace(
  "                      : selectedTenantId ? (",
  `                      : voiceError ? (
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 backdrop-blur-md border-t border-white/20 border-b border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all duration-300">
                        <span className="text-[10px] font-black text-red-400 tracking-tighter animate-pulse">ERR</span>
                        <span className="text-[10px] font-bold text-red-300 tracking-[0.2em] uppercase">TAP MIC TO RETRY</span>
                      </span>
                    ) : selectedTenantId ? (`
);

fs.writeFileSync('src/app/(dashboard)/reseller/[resellerSlug]/clients/page.tsx', d);
console.log('Clients page done.');
console.log('  voiceError:', d.includes('setVoiceError'));
console.log('  ttsPlaying:', d.includes('ttsPlaying,'));
console.log('  TTS gating ref:', d.includes('voiceHookTtsPlayingRef'));
console.log('  ERR badge:', d.includes('TAP MIC TO RETRY'));