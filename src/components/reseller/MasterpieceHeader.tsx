'use client';

import { Mic } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef } from 'react';
import { SignOutButton } from './SignOutButton';
import { SystemHelpTooltip } from './SystemHelpTooltip';

interface MasterpieceHeaderProps {
  isListening?: boolean;
  onMicClick?: () => void;
  isProcessing?: boolean;
  isAwaitingVoiceConfirm?: boolean;
  transcribedText?: string;
  isCommunicating?: boolean;
  playVoice?: (text: string) => Promise<void>;
  /** NEW: Explicit activation (Push-to-Talk) state */
  voiceActive?: boolean;
  /** NEW: Toggle handler for Push-to-Talk */
  onToggleVoice?: () => void;
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
    // Close context after tone completes
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
  isListening = false,
  onMicClick,
  isAwaitingVoiceConfirm = false,
  transcribedText,
  isCommunicating = false,
  playVoice: _playVoice,
  voiceActive = false,
  onToggleVoice,
}: MasterpieceHeaderProps) {
  // ── Fix 2: Eliminated Trigger C — automated playVoice on state transitions ──
  // The old useEffect auto-triggered an unwanted "System control active" TTS
  // every time isListening became true, causing duplicate audio (Trigger C).
  // All TTS is now exclusively initiated by command response logic in page.tsx.
  // The prop is retained in the interface for parent compatibility but unused here.
  void _playVoice;
  // ────────────────────────────────────────────────────────────────────────────

  // Track previous voiceActive value for transition detection
  const prevVoiceActiveRef = useRef(voiceActive);

  // Sonic feedback on voice activation/deactivation transitions
  useEffect(() => {
    const prev = prevVoiceActiveRef.current;
    if (voiceActive && !prev) {
      // Transition: false → true (activation)
      playReadyTone();
    } else if (!voiceActive && prev) {
      // Transition: true → false (deactivation)
      playStandbyTone();
    }
    prevVoiceActiveRef.current = voiceActive;
  }, [voiceActive]);

  // Unified click handler — supports both legacy onMicClick and new onToggleVoice
  const handleMicClick = useCallback(() => {
    // Prefer new API, fall back to legacy
    if (onToggleVoice) {
      onToggleVoice();
    } else {
      onMicClick?.();
    }
  }, [onToggleVoice, onMicClick]);

  // Determine if the mic should appear active
  // In explicit activation mode, voiceActive is the primary signal
  const isMicActive = voiceActive || isListening;

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
      
      <nav className="w-full flex justify-between items-center px-6 py-2 backdrop-blur-md bg-black/60 border border-white/5 rounded-2xl pointer-events-none">
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

        {/* Center: Voice Status Indicator - Clickable Mic - Glass Box with Gemstone Effect */}
        <SystemHelpTooltip>
          <div 
            onClick={handleMicClick}
            className={`relative flex items-center gap-2 px-3 py-1.5 rounded-full pointer-events-auto cursor-pointer active:scale-95 transition-all duration-300 ease-out overflow-hidden ${
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
            <div className="relative flex items-center justify-center">
              {/* The Mic Icon — with explicit activation glow when voiceActive */}
              <Mic 
                className={`w-4 h-4 transition-colors duration-300 ${
                  isCommunicating
                    ? "text-[#0097b2]"
                    : voiceActive
                      ? "text-cyan-400 animate-pulse drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]"
                      : isListening 
                        ? "text-[#0097b2]" 
                        : isAwaitingVoiceConfirm 
                          ? "text-emerald-400" 
                          : "text-gray-400"
                }`} 
              />
              
              {/* The Pulsing Ping Effect (Visible when listening or communicating) */}
              {(isMicActive || isCommunicating) && (
                <span className={`absolute inline-flex h-full w-full rounded-full bg-[#0097b2] opacity-100 ${
                  voiceActive ? 'animate-pulse-cyan' : 'animate-pulse'
                }`}></span>
              )}
            </div>

            <span className={`text-[9px] md:text-[10px] font-bold tracking-widest animate-pulse ${
              isCommunicating 
                ? "!text-[#00e5ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.6)]" 
                : voiceActive
                  ? "text-cyan-400 drop-shadow-[0_0_8px_rgba(0,229,255,0.6)]"
                  : isListening 
                    ? "text-[#0097b2]" 
                    : "text-[#0097b2]/70"
            }`}>
              {isCommunicating 
                ? 'PIERRE: SPEAKING...' 
                : voiceActive
                  ? 'LISTENING...'
                  : isListening 
                    ? 'LISTENING...' 
                    : 'SYSTEM'}
            </span>
            
            {/* Pierre HUD: STT Command Feedback */}
            {transcribedText && (
              <div className="ml-3 px-2 py-0.5 bg-[#226683]/50 border-l-2 border-[#0097b2] backdrop-blur-sm">
                <span className="text-[#0097b2] text-[9px] font-mono uppercase tracking-tighter italic">
                  Detected: {'\u201C'}{transcribedText}{'\u201D'}
                </span>
              </div>
            )}
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
    </>
  );
}