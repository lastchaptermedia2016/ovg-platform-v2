import fs from 'fs';

// ====================== VOICE HOOK ======================
let h = fs.readFileSync('src/hooks/use-voice-command.ts', 'utf8');
h = h.replace(/\r\n/g, '\n');

// 1. Add to interface
h = h.replace(
  '  resetPipeline: () => void;\n}\n\n/** Minimum press duration',
  '  resetPipeline: () => void;\n  /** NEW: ttsPlaying for acoustic loop gating */\n  ttsPlaying: boolean;\n}\n\n/** Minimum press duration'
);

// 2. Add constant
h = h.replace(
  'const MAX_RECORDING_DURATION_MS = 5_000;\n\nexport function',
  'const MAX_RECORDING_DURATION_MS = 5_000;\n\nconst MICRO_TAP_DIAGNOSTIC_BYTES = 12_000;\n\nexport function'
);

// 3. Add refs after voiceActive state
const vaPos = h.indexOf('  const [voiceActive, setVoiceActive] = useState(false);');
const vaEnd = h.indexOf('\n', vaPos);
const afterVA = h.substring(vaEnd);
const refsBlock = `

  const [ttsPlaying, setTtsPlaying] = useState(false);

  const networkInFlightRef = useRef(false);

  const ttsPlaybackActiveRef = useRef(false);`;
h = h.substring(0, vaEnd) + refsBlock + afterVA;

// 4. Modify resetVoiceActiveTimeout
const rst = '  const resetVoiceActiveTimeout = useCallback(() => {';
const rstIdx = h.indexOf(rst);
const rend = '  }, [explicitActivation]);';
const rendIdx = h.indexOf(rend, rstIdx) + rend.length;
const newReset = `  const resetVoiceActiveTimeout = useCallback(() => {
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
  }, [explicitActivation]);`;
h = h.substring(0, rstIdx) + newReset + h.substring(rendIdx);

// 5. Add suspend/resume callbacks
const cvaIdx = h.indexOf('  const clearVoiceActiveTimeout = useCallback(() => {');
const cvaEnd = h.indexOf('\n\n', cvaIdx);
const suspendBlock = `
  const suspendIdleTimeout = useCallback(() => {
    networkInFlightRef.current = true;
    clearVoiceActiveTimeout();
  }, [clearVoiceActiveTimeout]);

  const resumeIdleTimeout = useCallback(() => {
    networkInFlightRef.current = false;
    if (explicitActivation && voiceActive) {
      resetVoiceActiveTimeout();
    }
  }, [explicitActivation, voiceActive, resetVoiceActiveTimeout]);`;
h = h.substring(0, cvaEnd) + suspendBlock + h.substring(cvaEnd);

// 6. Add validateAudioResponse
const cfIdx = h.lastIndexOf('\n\n  // Cleanup function');
const validateBlock = `
  const validateAudioResponse = useCallback(
    async (response: Response, source: string):
      Promise<{ ok: true; arrayBuffer: ArrayBuffer } | { ok: false; errorMessage: string }> => {
      if (!response.ok) {
        const s = response.status;
        let m = '' + source + ' failed: ' + s;
        try { const e = await response.clone().json() as Record<string, unknown>; if (typeof e?.error === 'string') m = e.error; } catch {}
        return { ok: false, errorMessage: m };
      }
      const ct = response.headers.get('content-type') ?? '';
      if (!ct.includes('audio/')) {
        let m = '' + source + ' returned non-audio (' + ct + ')';
        try { const e = await response.clone().json() as Record<string, unknown>; if (typeof e?.error === 'string') m = e.error; } catch {}
        return { ok: false, errorMessage: m };
      }
      return { ok: true, arrayBuffer: await response.arrayBuffer() };
    },
    []
  );`;
h = h.substring(0, cfIdx) + validateBlock + h.substring(cfIdx);

// 7. Add suspendIdleTimeout call after try {
h = h.replace(
  '    try {\n\n      //',
  '    try {\n      suspendIdleTimeout();\n\n      //'
);

// 8. Add resumeIdleTimeout before skipAIPipeline return
h = h.replace(
  '      if (skipAIPipeline) {\n        return;\n      }',
  '      if (skipAIPipeline) {\n        resumeIdleTimeout();\n        return;\n      }'
);

// 9. Add resumeIdleTimeout before 'No text' return
h = h.replace(
  "        console.warn('[VoiceHook] Aborting internal TTS: No text or fallback summary available.');\n        return;",
  "        console.warn('[VoiceHook] Aborting internal TTS: No text or fallback summary available.');\n        resumeIdleTimeout();\n        return;"
);

// 10. Replace TTS section
const ttsIdx = h.indexOf("const ttsResponse = await fetch('/api/ai/speech'");
const endMarker = '      // \u2500\u2500 End inner try/catch \u2500\u2500';
const endIdx = h.indexOf(endMarker, ttsIdx) + endMarker.length;
const newTts = `      const ttsResponse = await fetch('/api/ai/speech', {
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

      const validated = await validateAudioResponse(ttsResponse, 'TTS');
      if (!validated.ok) {
        setIsSpeaking(false);
        setTtsPlaying(false);
        resumeIdleTimeout();
        throw new Error(validated.errorMessage);
      }

      setIsSpeaking(true);
      ttsPlaybackActiveRef.current = true;
      setTtsPlaying(true);

      const ttsCtx = ttsAudioContextRef.current;
      if (!ttsCtx) throw new Error('TTS AudioContext not initialized');

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

      const playbackMs = Math.ceil(audioBuffer.duration * 1000) + 500;
      setTimeout(() => {
        ttsPlaybackActiveRef.current = false;
        setTtsPlaying(false);
        setIsSpeaking(false);
        ttsAudioSourceRef.current = null;
        resumeIdleTimeout();
      }, playbackMs);
      // \u2500\u2500 End inner try/catch \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`;
h = h.substring(0, ttsIdx) + newTts;

// 11. Acoustic loop guard
h = h.replace(
  '  const startListening = useCallback(async () => {\n    if (isLockedRef.current) {',
  '  const startListening = useCallback(async () => {\n    if (ttsPlaybackActiveRef.current) {\n      console.warn(\'[VoiceCommand] TTS active - blocking\');\n      return;\n    }\n    if (isLockedRef.current) {'
);

// 12. Micro-tap diagnostic
const gs = '        if (audioBlob.size < 4096) {';
const gi = h.indexOf(gs);
const ge = h.indexOf('\n        }\n', gi);
h = h.substring(0, gi) + `        if (audioBlob.size < 4096) {
          console.warn('[VoiceCommand] Blob too small (%d bytes)', audioBlob.size);
          cleanup();
          return;
        }
        if (audioBlob.size < MICRO_TAP_DIAGNOSTIC_BYTES) {
          console.warn('[VoiceCommand] Micro-tap: %d < %d', audioBlob.size, MICRO_TAP_DIAGNOSTIC_BYTES);
        }` + h.substring(ge + 12);

// 13. resumeIdleTimeout in catch
h = h.replace(
  '      const errorMsg = err instanceof Error ? err.message : \'Voice command failed\';',
  '      resumeIdleTimeout();\n      const errorMsg = err instanceof Error ? err.message : \'Voice command failed\';'
);

// 14. Return ttsPlaying
h = h.replace(
  '    resetPipeline,\n  };\n}',
  '    resetPipeline,\n    ttsPlaying,\n  };\n}'
);

fs.writeFileSync('src/hooks/use-voice-command.ts', h.replace(/\n/g, '\r\n'));
console.log('Voice hook:');
console.log('  validateAudioResponse:', h.includes('validateAudioResponse'));
console.log('  networkInFlightRef:', h.includes('networkInFlightRef'));
console.log('  suspendIdleTimeout:', h.includes('suspendIdleTimeout'));
console.log('  resumeIdleTimeout:', h.includes('resumeIdleTimeout'));
console.log('  ttsPlaybackActiveRef:', h.includes('ttsPlaybackActiveRef'));
console.log('  ttsPlaying return:', h.includes('ttsPlaying,'));
console.log('  MICRO_TAP:', h.includes('MICRO_TAP_DIAGNOSTIC_BYTES'));

// ====================== CLIENTS PAGE ======================
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
  "  const {\n    isListening,\n    isProcessing,\n    transcript: voiceTranscript,\n    voiceActive,\n    activateVoice,\n    deactivateVoice,\n    startListening,\n    stopListening,\n    resetPipelineLock,",
  "  const {\n    isListening,\n    isProcessing,\n    transcript: voiceTranscript,\n    ttsPlaying,\n    voiceActive,\n    activateVoice,\n    deactivateVoice,\n    startListening,\n    stopListening,\n    resetPipelineLock,"
);

d = d.replace(
  "  useEffect(() => { voiceActiveRef.current = voiceActive; }, [voiceActive]);",
  "  useEffect(() => { voiceActiveRef.current = voiceActive; }, [voiceActive]);\n  useEffect(() => { voiceHookTtsPlayingRef.current = ttsPlaying; }, [ttsPlaying]);\n\n  useEffect(() => { if (voiceTranscript) setVoiceError(null); }, [voiceTranscript]);"
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

fs.writeFileSync('src/app/(dashboard)/reseller/[resellerSlug]/clients/page.tsx', d.replace(/\n/g, '\r\n'));
console.log('Clients page:');
console.log('  voiceError:', d.includes('setVoiceError'));
console.log('  ttsPlaying:', d.includes('ttsPlaying,\n    voiceActive'));
console.log('  TTS gating ref:', d.includes('voiceHookTtsPlayingRef'));
console.log('  ERR badge:', d.includes('TAP MIC TO RETRY'));