'use client';

import { memo } from 'react';

interface CaptionsHUDProps {
  text: string;
  isVisible: boolean;
}

export const CaptionsHUD = memo(function CaptionsHUD({ text, isVisible }: CaptionsHUDProps) {
  if (!isVisible || !text) return null;

  return (
    <div 
      className={`
        fixed left-0 right-0 z-[110] transition-all duration-500
        ${isVisible ? 'bottom-0 opacity-100' : '-bottom-20 opacity-0'}
        md:bottom-auto md:top-[140px] md:left-1/2 md:-translate-x-1/2 md:w-auto md:max-w-2xl
      `}
    >
      <div 
        className="
          mx-auto max-w-md md:max-w-2xl
          bg-black/80 backdrop-blur-lg 
          border-t border-[#0097b2]/30 md:border-2 md:border-[#0097b2]/50 md:rounded-xl
          p-4 md:px-6 md:py-4
          rounded-t-2xl md:rounded-xl
          shadow-[0_0_40px_rgba(0,151,178,0.4)] 
          animate-fade-in-up
        "
      >
        {/* Electric Blue glow effect - Desktop only */}
        <div className="hidden md:block absolute inset-0 rounded-xl bg-gradient-to-r from-[#0097b2]/10 via-transparent to-[#0097b2]/10 pointer-events-none" />
        
        {/* Typing indicator */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0097b2] animate-pulse" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#0097b2] animate-pulse delay-75" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#0097b2] animate-pulse delay-150" />
          </div>
          <span className="text-[10px] tracking-widest uppercase text-[#0097b2]/70 font-semibold">
            Silent Mode
          </span>
        </div>
        
        {/* Caption text with Electric Blue aesthetic */}
        <p className="text-sm md:text-lg font-medium text-white leading-relaxed relative z-10">
          {text}
          <span className="inline-block w-0.5 h-4 md:h-5 bg-[#0097b2] ml-1 animate-blink align-middle" />
        </p>
        
        {/* Decorative line */}
        <div className="mt-3 h-0.5 bg-gradient-to-r from-transparent via-[#0097b2] to-transparent opacity-50" />
        
        {/* Mobile drag handle indicator */}
        <div className="md:hidden w-12 h-1 bg-white/20 rounded-full mx-auto mt-4" />
      </div>
    </div>
  );
});
