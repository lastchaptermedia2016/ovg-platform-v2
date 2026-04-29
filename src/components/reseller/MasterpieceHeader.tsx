'use client';

import { Mic } from 'lucide-react';

interface MasterpieceHeaderProps {
  isListening?: boolean;
  onMicClick?: () => void;
  isProcessing?: boolean;
  isAwaitingVoiceConfirm?: boolean;
  transcribedText?: string;
  isCommunicating?: boolean;
}

export function MasterpieceHeader({ 
  isListening = false, 
  onMicClick,
  isProcessing = false,
  isAwaitingVoiceConfirm = false,
  transcribedText,
  isCommunicating = false
}: MasterpieceHeaderProps) {
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
        .animate-breathing-glow {
          animation: breathing-glow 3s ease-in-out infinite;
        }
        .animate-shimmer {
          animation: shimmer 5s ease-in-out infinite;
        }
      `}</style>
      
      <nav className="w-full flex justify-between items-center px-6 py-5 backdrop-blur-md bg-white/[0.01] border border-white/5 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.1)] pointer-events-none">
        {/* Left Side - Gold 3D-styled lettering */}
        <div className="text-[9px] font-bold tracking-[0.6em] text-white/40 uppercase animate-signature-pulse pointer-events-auto">
          POWERED BY PIERRE
        </div>

        {/* Center: Voice Status Indicator - Clickable Mic - Glass Box with Gemstone Effect */}
        <div 
          onClick={onMicClick}
          className={`relative flex items-center gap-3 px-4 py-2 bg-white/10 rounded-full pointer-events-auto cursor-pointer active:scale-95 transition-all duration-300 ease-out overflow-hidden ${
            isAwaitingVoiceConfirm ? 'bg-emerald-500/10 border border-emerald-500/30' : ''
          } ${
            isListening ? 'bg-[#0097b2]/20 border border-[#0097b2]/40' : ''
          } ${
            isCommunicating ? 'animate-breathing-glow border border-[#0097b2]/60' : 'border-t border-white/20 border-b border-[#0097b2]/40'
          }`}
        >
          {/* Shimmer effect for active states */}
          {(isListening || isCommunicating) && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute inset-0 animate-shimmer">
                <div className="w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent transform -skew-x-12" />
              </div>
            </div>
          )}
        <div className="relative flex items-center justify-center">
          {/* The Mic Icon */}
          <Mic 
            className={`w-5 h-5 transition-colors duration-300 ${
              isCommunicating
                ? "text-[#0097b2]"
                : isListening 
                  ? "text-[#0097b2]" 
                  : isAwaitingVoiceConfirm 
                    ? "text-emerald-400" 
                    : "text-gray-400"
            }`} 
          />
          
          {/* The Pulsing Ping Effect (Visible when listening or communicating) */}
          {(isListening || isCommunicating) && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#0097b2] opacity-100 animate-pulse"></span>
          )}
        </div>

        <span className={`text-[10px] font-bold tracking-widest animate-pulse ${
          isCommunicating 
            ? "!text-[#00e5ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.6)]" 
            : isListening 
              ? "text-[#0097b2]" 
              : "text-[#0097b2]/70"
        }`}>
          {isCommunicating 
            ? 'PIERRE: SPEAKING...' 
            : isListening 
              ? 'LISTENING...' 
              : 'VOICE READY'}
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
    </>
  );
}
