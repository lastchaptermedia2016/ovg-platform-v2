const fs = require('fs');

// ============================================================
// Phase 1: use-voice-command.ts
// ============================================================
let hook = fs.readFileSync('src/hooks/use-voice-command.ts', 'utf8');

// Fix 1: Add ttsPlaying to interface
hook = hook.replace(
  '  resetPipeline: () => void;\n}\n\n/** Minimum press duration',
  '  resetPipeline: () => void;\n  /** NEW: True while the internal TTS AudioContext is actively playing back\n   *  audio. UI consumers should gate mic re-arming on !ttsPlaying to\n   *  prevent acoustic loop / Hannah hearing her own speaker output. */\n  ttsPlaying: boolean;\n}\n\n/** Minimum press duration'
);

// Fix 2: Add ttsPlaying state, networkInFlightRef, ttsPlaybackActiveRef
hook = hook.replace(
  '  const [voiceActive, setVoiceActive] = useState(false);\n\n  // \u2500\u2500\u2500 NEW (PTT): Push-to-Talk state machine',
  '  const [voiceActive, setVoiceActive] = useState(false);\n\n  /** NEW: Mirrors ttsPlaybackActiveRef for React consumers (UI gating). */\n  const [ttsPlaying, setTtsPlaying] = useState(false);\n\n  /** NEW: True while a network round-trip is in flight. Suspends the\n   *  client-side 10s idle timeout so Vercel cold-starts don\\\'t tear the\n   *  mic down mid-pipeline. */\n  const networkInFlightRef = useRef(false);\n\n  /** NEW: Latched true while TTS audio is playing. Blocks MediaRecorder\n   *  start to prevent acoustic loop / Hannah hearing herself. */\n  const ttsPlaybackActiveRef = useRef(false);\n\n  // \u2500\u2500\u2500 NEW (PTT): Push-to-Talk state machine'
);

// Fix 3: Add MICRO_TAP_DIAGNOSTIC_BYTES constant
hook = hook.replace(
  'const MAX_RECORDING_DURATION_MS = 5_000;\n\nexport function',
  'const MAX_RECORDING_DURATION_MS = 5_000;\n\n/** Secondary diagnostic threshold (bytes). */\nconst MICRO_TAP_DIAGNOSTIC_BYTES = 12_000;\n\nexport function'
);

// Fix 4: Modify resetVoiceActiveTimeout to gate on networkInFlightRef
const oldResetTimeout = `  const resetVoiceActiveTimeout = useCallback(() => {
    if (!explicitActivation) return;
    if (voiceActiveTimeoutRef.current) {
      clearTimeout(voiceActiveTimeoutRef.current);
    }
    voiceActiveTimeoutRef.current = setTimeout(() => {
      console.log('[VoiceCommand] ⏰ 10s idle timeout reached \u2014 auto-deactivating mic');
      onAutoDeactivateRef.current?.();
      deactivateVoiceRef.current();
    }, IDLE_TIMEOUT_MS);
  }, [explicitActivation]);`;

const newResetTimeout = `  const resetVoiceActiveTimeout = useCallback(() => {
    if (!explicitActivation) return;
    // Network-in-flight guard: never arm the timer while a network round-trip
    // is in progress. The resume() call from the pipeline completion will
    // re-arm it after the in-flight flag clears.
    if (networkInFlightRef.current) return;
    if (voiceActiveTimeoutRef.current) {
      clearTimeout(voiceActiveTimeoutRef.current);
    }
    voiceActiveTimeoutRef.current = setTimeout(() => {
      // Self-defending: bail if a request started between schedule and fire
      if (networkInFlightRef.current) return;
      onAutoDeactivateRef.current?.();
      deactivateVoiceRef.current();
    }, IDLE_TIMEOUT_MS);
  }, [explicitActivation]);`;

hook = hook.replace(oldResetTimeout, newResetTimeout);

// Fix 5: Add suspendIdleTimeout and resumeIdleTimeout after clearVoiceActiveTimeout
const oldClearTimeout = `  // Cleanup the idle timeout
  const clearVoiceActiveTimeout = useCallback(() => {
    if (voiceActiveTimeoutRef.current) {
      clearTimeout(voiceActiveTimeoutRef.current);
      voiceActiveTimeoutRef.current = null;
    }
  }, []);

  // Cleanup function`;

const newClearTimeout = `  // Cleanup the idle timeout
  const clearVoiceActiveTimeout = useCallback(() => {
    if (voiceActiveTimeoutRef.current) {
      clearTimeout(voiceActiveTimeoutRef.current);
      voiceActiveTimeoutRef.current = null;
    }
  }, []);

  // \u2500\u2500\u2500 NEW: Network-aware idle-timeout suspension (Fix 2) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
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

hook = hook.replace(oldClearTimeout, newClearTimeout);

// Fix 6: Add validateAudioResponse after resumeIdleTimeout
const afterResumeIdle = `  const resumeIdleTimeout = useCallback(() => {
    networkInFlightRef.current = false;
    if (explicitActivation && voiceActive) {
      resetVoiceActiveTimeout();
    }
  }, [explicitActivation, voiceActive, resetVoiceActiveTimeout]);

  // Cleanup function`;

const withValidate = `  const resumeIdleTimeout = useCallback(() => {
    networkInFlightRef.current = false;
    if (explicitActivation && voiceActive) {
      resetVoiceActiveTimeout();
    }
  }, [explicitActivation, voiceActive, resetVoiceActiveTimeout]);

  // \u2500\u2500\u2500 NEW (Fix 1): Validate audio response before decoding \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const validateAudioResponse = useCallback(
    async (response: Response, source: string):
      Promise<{ ok: true; arrayBuffer: ArrayBuffer } | { ok: false; errorMessage: string }> => {
      if (!response.ok) {
        const status = response.status;
        let msg = source + ' failed: ' + status;
        try {
          const err = await response.clone().json() as Record<string, unknown>;
          if (typeof err?.error === 'string') msg = err.error;
        } catch {}
        return { ok: false, errorMessage: msg };
      }
      const ct = response.headers.get('content-type') ?? '';
      if (!ct.includes('audio/')) {
        let msg = source + ' returned non-audio response (' + ct + ')';
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

hook = hook.replace(afterResumeIdle, withValidate);

// Fix 7: Add suspendIdleTimeout after try {
hook = hook.replace(
  '    try {\n      // \u2500\u2500 Production Excellence: Transcode webm/opus \u2192 16kHz mono WAV \u2500\u2500',
  '    try {\n      // Suspend idle timer while network requests are in flight\n      suspendIdleTimeout();\n\n      // \u2500\u2500 Production Excellence: Transcode webm/opus \u2192 16kHz mono WAV \u2500\u2500'
);

// Fix 8: Add resumeIdleTimeout before skipAIPipeline return
hook = hook.replace(
  '      if (skipAIPipeline) {\n        return;\n      }',
  '      if (skipAIPipeline) {\n        resumeIdleTimeout();\n        return;\n      }'
);

// Fix 9: Add resumeIdleTimeout before the 'No text' return
hook = hook.replace(
  "        console.warn('[VoiceHook] Aborting internal TTS: No text or fallback summary available.');\n        return;",
  "        console.warn('[VoiceHook] Aborting internal TTS: No text or fallback summary available.');\n        resumeIdleTimeout();\n        return;"
);

// Fix 10: Replace TTS section with validateAudioResponse + acoustic loop guards
const oldTtsBlock = `      const ttsResponse = await fetch('/api/ai/speech', {
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

      if (!ttsResponse.ok) {
        throw new Error(\`TTS failed: \${ttsResponse.status}\`);
      }

      // \u2500\u2500 Stripped-down TTS playback \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      setIsSpeaking(true);

      const ttsCtx = ttsAudioContextRef.current;
      if (!ttsCtx) throw new Error('TTS AudioContext not initialized');

      // Stop any currently playing TTS
      if (ttsAudioSourceRef.current) {
        try { ttsAudioSourceRef.current.stop(); } catch {}
        ttsAudioSourceRef.current = null;
      }

      const arrayBuffer = await ttsResponse.arrayBuffer();
      const audioBuffer = await ttsCtx.decodeAudioData(arrayBuffer);

      const source = ttsCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ttsCtx.destination);

      if (ttsCtx.state === 'suspended') {
        await ttsCtx.resume();
      }

      console.log('[TTS] Playing, duration:', audioBuffer.duration, 'ctx state:', ttsCtx.state);

      source.start(0);
      ttsAudioSourceRef.current = source;

      // Single cleanup timeout \u2014 fires after audio should be done
      const playbackMs = Math.ceil(audioBuffer.duration * 1000) + 500;
      setTimeout(() => {
        console.log('[TTS] Cleanup timeout fired');
        setIsSpeaking(false);
        ttsAudioSourceRef.current = null;
      }, playbackMs);
      // \u2500\u2500 End inner try/catch \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`;

const newTtsBlock = `      const ttsResponse = await fetch('/api/ai/speech', {
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

      // \u2500\u2500 NEW: Validate audio response before decoding \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      const validated = await validateAudioResponse(ttsResponse, 'TTS');
      if (!validated.ok) {
        setIsSpeaking(false);
        setTtsPlaying(false);
        resumeIdleTimeout();
        throw new Error(validated.errorMessage);
      }

      // \u2500\u2500 Stripped-down TTS playback \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
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

      // Single cleanup timeout \u2014 fires after audio should be done.
      // Resumes the idle timeout now that TTS playback is complete.
      const playbackMs = Math.ceil(audioBuffer.duration * 1000) + 500;
      setTimeout(() => {
        ttsPlaybackActiveRef.current = false;
        setTtsPlaying(false);
        setIsSpeaking(false);
        ttsAudioSourceRef.current = null;
        resumeIdleTimeout();
      }, playbackMs);`;

hook = hook.replace(oldTtsBlock, newTtsBlock);

// Fix 11: Add resumeIdleTimeout in catch
hook = hook.replace(
  '      const errorMsg = err instanceof Error ? err.message : \'Voice command failed\';',
  '      resumeIdleTimeout();\n      const errorMsg = err instanceof Error ? err.message : \'Voice command failed\';'
);

// Fix 12: Add acoustic loop guard in startListening
hook = hook.replace(
  '  const startListening = useCallback(async () => {\n    if (isLockedRef.current) {',
  '  const startListening = useCallback(async () => {\n    // Acoustic loop guard: block mic while TTS plays\n    if (ttsPlaybackActiveRef.current) {\n      console.warn(\'[VoiceCommand] TTS playback active \u2014 blocking mic start\');\n      return;\n    }\n    if (isLockedRef.current) {'
);

// Fix 13: Add micro-tap diagnostic warning in onstop
hook = hook.replace(
  `        if (audioBlob.size < 4096) {
          console.warn('[VoiceCommand] Blob too small to be a valid media file (%d bytes), skipping pipeline', audioBlob.size);
          cleanup();
          return;
        }`,
  `        if (audioBlob.size < 4096) {
          console.warn('[VoiceCommand] Blob too small (%d bytes), skipping pipeline', audioBlob.size);
          cleanup();
          return;
        }

        if (audioBlob.size < MICRO_TAP_DIAGNOSTIC_BYTES) {
          console.warn('[VoiceCommand] Micro-tap: %d bytes below %d threshold', audioBlob.size, MICRO_TAP_DIAGNOSTIC_BYTES);
        }`
);

// Fix 14: Add ttsPlaying to return object
hook = hook.replace(
  '    resetPipeline,',
  '    resetPipeline,\n    ttsPlaying,'
);

fs.writeFileSync('src/hooks/use-voice-command.ts', hook);
console.log('Voice hook: OK');

// ============================================================
// Phase 2: clients/page.tsx
// ============================================================
let page = fs.readFileSync('src/app/(dashboard)/reseller/[resellerSlug]/clients/page.tsx', 'utf8');

// PC-1: Add voiceError state
page = page.replace(
  '  const [successRipple, setSuccessRipple] = useState(false);',
  '  const [successRipple, setSuccessRipple] = useState(false);\n  const [voiceError, setVoiceError] = useState<string | null>(null);'
);

// PC-2: Add voiceHookTtsPlayingRef
page = page.replace(
  '  const voiceActiveRef = useRef(false);',
  '  const voiceActiveRef = useRef(false);\n  const voiceHookTtsPlayingRef = useRef(false);'
);

// PC-3: Make onError actionable
page = page.replace(
  '    onError: (err) => console.error(\'Voice command error:\', err),',
  '    onError: (err) => {\n      console.error(\'Voice command error:\', err);\n      setVoiceError(err);\n      speakVoiceRef.current(\'I didn\\\'t catch that. Please try again.\');\n    },'
);

// PC-4: Add voiceError clear effect before const {
page = page.replace(
  '  const {',
  '  useEffect(() => { if (voiceTranscript) setVoiceError(null); }, [voiceTranscript]);\n\n  const {'
);

// PC-5: Add ttsPlaying destructure
page = page.replace(
  '    transcript: voiceTranscript,\n    voiceActive,',
  '    transcript: voiceTranscript,\n    ttsPlaying,\n    voiceActive,'
);

// PC-6: Sync voiceHookTtsPlayingRef
page = page.replace(
  '  useEffect(() => { voiceActiveRef.current = voiceActive; }, [voiceActive]);',
  '  useEffect(() => { voiceActiveRef.current = voiceActive; }, [voiceActive]);\n  useEffect(() => { voiceHookTtsPlayingRef.current = ttsPlaying; }, [ttsPlaying]);'
);

// PC-7: Gate recovery timer on internal TTS
page = page.replace(
  '                    if (isVoicePlayingRef.current) return;',
  '                    if (isVoicePlayingRef.current) return;\n                    if (voiceHookTtsPlayingRef.current) return;'
);

// PC-8: Surface voiceError badge
page = page.replace(
  '                      : selectedTenantId ? (',
  '                      : voiceError ? (\n                      <span className=\"inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 backdrop-blur-md border-t border-white/20 border-b border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all duration-300\">\n                        <span className=\"text-[10px] font-black text-red-400 tracking-tighter animate-pulse\">ERR</span>\n                        <span className=\"text-[10px] font-bold text-red-300 tracking-[0.2em] uppercase\">TAP MIC TO RETRY</span>\n                      </span>\n                    ) : selectedTenantId ? ('
);

fs.writeFileSync('src/app/(dashboard)/reseller/[resellerSlug]/clients/page.tsx', page);
console.log('Clients page: OK');

console.log('All changes applied.');