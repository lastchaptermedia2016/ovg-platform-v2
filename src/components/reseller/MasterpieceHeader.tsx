'use client';

import { Mic } from 'lucide-react';

interface MasterpieceHeaderProps {
  isListening?: boolean;
  onMicClick?: () => void;
  isProcessing?: boolean;
  isAwaitingVoiceConfirm?: boolean;
  transcribedText?: string;
}

export function MasterpieceHeader({ 
  isListening = false, 
  onMicClick,
  isProcessing = false,
  isAwaitingVoiceConfirm = false,
  transcribedText
}: MasterpieceHeaderProps) {
  return (
    <nav className="w-full flex justify-between items-center px-6 py-5 backdrop-blur-md bg-white/[0.01] border border-white/5 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.1)] pointer-events-none">
      {/* Left Side */}
      <div className="text-[9px] font-bold tracking-[0.6em] text-white/40 uppercase animate-signature-pulse pointer-events-auto">
        POWERED BY PIERRE
      </div>

      {/* Center: Voice Status Indicator - Clickable Mic */}
      <div 
        onClick={onMicClick}
        className={`flex items-center gap-3 px-4 py-2 bg-black/20 rounded-full border border-[#0097b2]/30 pointer-events-auto cursor-pointer active:scale-95 transition-transform ${
          isAwaitingVoiceConfirm ? 'bg-emerald-500/10 border-emerald-500/30' : ''
        }`}
      >
        <div className="relative flex items-center justify-center">
          {/* The Mic Icon */}
          <Mic 
            className={`w-5 h-5 transition-colors duration-300 ${
              isListening 
                ? "text-[#0097b2]" 
                : isAwaitingVoiceConfirm 
                  ? "text-emerald-400" 
                  : "text-gray-400"
            }`} 
          />
          
          {/* The Pulsing Ping Effect (Only visible when ready/active) */}
          {!isListening && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#0097b2] opacity-75 animate-ping"></span>
          )}
          {isListening && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#0097b2] opacity-100 animate-pulse"></span>
          )}
        </div>

        <span className={`text-[10px] font-bold tracking-widest animate-pulse ${
          isListening ? "text-[#0097b2]" : "text-[#0097b2]/70"
        }`}>
          {isListening ? 'LISTENING...' : 'VOICE READY'}
        </span>
        
        {/* Pierre HUD: STT Command Feedback */}
        {transcribedText && (
          <div className="ml-4 px-3 py-1 bg-[#226683]/50 border-l-2 border-[#0097b2] backdrop-blur-sm">
            <span className="text-[#0097b2] text-[10px] font-mono uppercase tracking-tighter italic">
              Detected: "{transcribedText}"
            </span>
          </div>
        )}
      </div>

      {/* Right Side */}
      <div className="flex items-center pointer-events-auto">
        <span className="text-[#FFD700] font-black text-xl animate-pulse-gold">
          AI
        </span>
        <div className="h-4 w-[1px] bg-white/20 mx-6" />
        <span className="text-white/90 font-light tracking-[0.4em] text-[10px] uppercase">
          RESELLER DASHBOARD
        </span>
      </div>
    </nav>
  );
}
