'use client';

import { Mic } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef } from 'react';
import { SignOutButton } from './SignOutButton';
import { SystemHelpTooltip } from './SystemHelpTooltip';

/** Windows 300 ms: synthetic mouse events trailing a real touch are dropped. */
const TOUCH_DEDUP_MS = 300;

function triggerHapticFeedback(): void {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(30);
  }
}

interface MasterpieceHeaderProps {
  /** True while the mic is actively capturing audio. */
  isRecording?: boolean;
  /** Strict PTT: Begin audio capture on mousedown / touchstart. */
  onStartRecording?: () => void;
  /** Strict PTT: Finalize audio on mouseup / touchend. Triggers the pipeline. */
  onStopListeningAndProcess?: () => void;
  /** Strict PTT: Abort capture on mouseleave / touchcancel. Never triggers the pipeline. */
  onAbortRecording?: () => void;
  isProcessing?: boolean;
  isAwaitingVoiceConfirm?: boolean;
  transcribedText?: string;
  isCommunicating?: boolean;
  playVoice?: (text: string) => Promise<void>;
}

/**
 * Plays a short "ready" tone via Web Audio API — ascending sine wave.
 * No asset files needed.
 */
function playReadyTone(): void {
  try {
    const AudioContextCtor = (typeof AudioContext !== 'undefined')
      ? AudioContext
      : ((window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AudioContextCtor) return;
    const audioCtx = new AudioContextCtor();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
    setTimeout(() => { audioCtx.close(); }, 500);
  } catch {
    // Silently fail — audio feedback is non-critical
  }
}

/**
 * Plays a short "standby" tone via Web Audio API — descending sine wave.
 * No asset files needed.
 */
function playStandbyTone(): void {
  try {
    const AudioContextCtor = (typeof AudioContext !== 'undefined')
      ? AudioContext
      : ((window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AudioContextCtor) return;
    const audioCtx = new AudioContextCtor();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(440, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
    setTimeout(() => { audioCtx.close(); }, 400);
  } catch {
    // Silently fail — audio feedback is non-critical
  }
}

export function MasterpieceHeader({
  isRecording = false,
  onStartRecording,
  onStopListeningAndProcess,
  onAbortRecording,
  isAwaitingVoiceConfirm = false,
  transcribedText,
  isCommunicating = false,
  playVoice: _playVoice,
}: MasterpieceHeaderProps) {
  void _playVoice;

  /** Timestamp anchor: when a real hardware touch event was last handled. */
  const lastTouchEventRef = useRef<number>(0);

  // Track previous isRecording value for sonic transition detection
  const prevRecordingRef = useRef(isRecording);

  // Sonic feedback on recording start/stop transitions
  useEffect(() => {
    const prev = prevRecordingRef.current;
    if (isRecording && !prev) {
      playReadyTone();
    } else if (!isRecording && prev) {
      playStandbyTone();
    }
    prevRecordingRef.current = isRecording;
  }, [isRecording]);

  // Strict PTT event handlers — touch/mouse deduplication.
  const handleMicMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const isTouch = e.type.startsWith('touch');
    if (!isTouch && Date.now() - lastTouchEventRef.current < TOUCH_DEDUP_MS) return;
    if (isTouch) {
      lastTouchEventRef.current = Date.now();
      triggerHapticFeedback();
    }
    console.log('[PTT] 🔥 Mic %s captured — dispatching startRecording', e.type);
    onStartRecording?.();
  }, [onStartRecording]);

  const handleMicMouseUp = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const isTouch = e.type.startsWith('touch');
    if (!isTouch && Date.now() - lastTouchEventRef.current < TOUCH_DEDUP_MS) return;
    if (isTouch) lastTouchEventRef.current = Date.now();
    console.log('[PTT] 🔥 Mic %s captured — dispatching stopListeningAndProcess', e.type);
    onStopListeningAndProcess?.();
  }, [onStopListeningAndProcess]);

  const handleMicMouseLeave = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const isTouch = e.type.startsWith('touch');
    if (!isTouch && Date.now() - lastTouchEventRef.current < TOUCH_DEDUP_MS) return;
    if (isTouch) lastTouchEventRef.current = Date.now();
    console.log('[PTT] 🔥 Mic %s captured — dispatching abortRecording', e.type);
    onAbortRecording?.();
  }, [onAbortRecording]);

  // Determine if the mic should appear active
  const isMicActive = isRecording;

  return (
    <>
      {/* Global shimmer animation styles */}
      <style jsx global>{`
        @keyframes breathing-glow {
          0%, 100% { box-shadow: 0 0 15px rgba(0, 151, 178, 0.3), 0 0 30px rgba(0, 151, 178, 0.2); }
          50% { box-shadow: 0 0 25px rgba(0, 151, 178, 0.5), 0 0 50px rgba(0, 151, 178, 0.3); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes pulse-cyan {
          0%, 100% { box-shadow: 0 0 10px rgba(0, 229, 255, 0.3), 0 0 20px rgba(0, 229, 255, 0.2); }
          50% { box-shadow: 0 0 25px rgba(0, 229, 255, 0.7), 0 0 50px rgba(0, 229, 255, 0.4); }
        }
        .animate-breathing-glow {
          animation: breathing-glow 3s ease-in-out infinite;
        }
        .animate-shimmer {
          animation: shimmer 5s ease-in-out infinite;
        }
        .animate-pulse-cyan {
          animation: pulse-cyan 2s ease-in-out infinite;
        }
      `}</style>
      
      <nav className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 w-full backdrop-blur-md bg-black/60 border border-white/5 rounded-2xl pointer-events-none">
        {/* Left Side - POWERED BY PIERRE AI */}
        <div className="flex items-center space-x-2 pointer-events-auto">
          <span className="text-white/60 text-[10px] font-light tracking-wider uppercase">
            POWERED BY PIERRE
          </span>
          <motion.span
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.8, 1, 0.8]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="text-[#FFD700] text-[10px] font-bold tracking-wider uppercase drop-shadow-[0_0_15px_rgba(255,215,0,0.5)]"
          >
            AI
          </motion.span>
        </div>

        {/* Center: Voice Status Indicator - PTT Mic Button with Locked Geometry */}
        <SystemHelpTooltip>
          <div 
            onMouseDown={handleMicMouseDown}
            onMouseUp={handleMicMouseUp}
            onMouseLeave={handleMicMouseLeave}
            onTouchStart={handleMicMouseDown}
            onTouchEnd={handleMicMouseUp}
            onTouchCancel={handleMicMouseLeave}
            className={`relative flex items-center justify-center gap-2 w-48 flex-shrink-0 px-3 py-1.5 rounded-full pointer-events-auto cursor-pointer touch-none select-none active:scale-95 duration-75 transition-transform overflow-hidden ${
              isAwaitingVoiceConfirm ? 'bg-emerald-500/10 border border-emerald-500/30' : ''
            } ${
              isMicActive ? 'bg-[#0097b2]/20 border border-[#0097b2]/40' : ''
            } ${
              isCommunicating ? 'animate-breathing-glow border border-[#0097b2]/60' : 'border-t border-white/20 border-b border-[#0097b2]/40'
            }`}
          >
            {/* Shimmer effect for active states */}
            {(isMicActive || isCommunicating) && (
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 animate-shimmer">
                  <div className="w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent transform -skew-x-12" />
                </div>
              </div>
            )}
            <div className="relative flex items-center justify-center flex-shrink-0">
              {/* The Mic Icon — with recording glow when active */}
              <Mic 
                className={`w-4 h-4 transition-colors duration-300 ${
                  isCommunicating
                    ? "text-[#0097b2]"
                    : isRecording
                      ? "text-cyan-400 animate-pulse drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]"
                      : isAwaitingVoiceConfirm 
                        ? "text-emerald-400" 
                        : "text-gray-400"
                }`} 
              />
              
              {/* The Pulsing Ping Effect (Visible when recording or communicating) */}
              {(isMicActive || isCommunicating) && (
                <span className={`absolute inline-flex h-full w-full rounded-full bg-[#0097b2] opacity-100 ${
                  isRecording ? 'animate-pulse-cyan' : 'animate-pulse'
                }`}></span>
              )}
            </div>

            <span className={`text-[9px] md:text-[10px] font-bold tracking-widest text-center truncate ${
              isCommunicating 
                ? "!text-[#00e5ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.6)]" 
                : isRecording
                  ? "text-cyan-400 drop-shadow-[0_0_8px_rgba(0,229,255,0.6)]"
                  : "text-[#0097b2]/70"
            }`}>
              {isCommunicating 
                ? 'PIERRE: SPEAKING...' 
                : isRecording
                  ? 'HOLD TO RECORD...' 
                  : 'SYSTEM'}
            </span>
          </div>
        </SystemHelpTooltip>

        {/* Right Side */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <SignOutButton />
          <div className="h-3 w-[1px] bg-white/20" />
          <span className="text-white/80 text-[10px] font-medium tracking-wider uppercase">
            ZEEDER AI
          </span>
          <div className="h-3 w-[1px] bg-white/20" />
          <span className="text-cyan-400 text-[10px] font-bold tracking-wider uppercase">
            RESELLER
          </span>
        </div>
      </nav>
       
      {/* STT Layer - Dedicated full-width container beneath navbar */}
      <div className="w-full px-4 mt-2 h-5 flex items-center justify-center">
        <span className={`text-[#0097b2]/60 text-[10px] font-mono uppercase tracking-tight italic transition-opacity duration-200 ${
          transcribedText ? 'opacity-100' : 'opacity-30'
        }`}>
          {transcribedText 
            ? `Detected: "${transcribedText}"`
            : '\u2009'}
        </span>
      </div>
    </>
  );
}