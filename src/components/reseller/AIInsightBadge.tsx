'use client';

import { useState } from 'react';

interface AIInsightBadgeProps {
  insight: string;
  isPulsing?: boolean;
}

export function AIInsightBadge({ insight, isPulsing = false }: AIInsightBadgeProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button className={`!opacity-100 !mix-blend-normal backdrop-blur-none w-6 h-6 rounded-full flex items-center justify-center hover:bg-[#0097b2]/30 transition-all duration-300 group ${
        isPulsing ? 'shadow-[0_0_15px_#0097b2]' : ''
      }`} style={{ 
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderColor: 'rgba(0, 151, 178, 0.5)',
        filter: 'drop-shadow(0 0 2px rgba(0, 151, 178, 0.3))',
        transform: 'translateZ(0)'
      }}>
        <span className="text-[10px] font-extrabold text-[#FFD700] animate-ai-pulse" style={{ letterSpacing: '-0.05em' }}>
          AI
        </span>
      </button>

      {isHovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 backdrop-blur-xl bg-white/10 border border-white/20 rounded-lg shadow-2xl z-50">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-[#0097b2] animate-pulse" />
            <span className="text-[10px] font-bold tracking-[0.2em] text-[#0097b2] uppercase">AI Insight</span>
          </div>
          <p className="text-xs text-white/90 leading-relaxed">
            {insight}
          </p>
          <div className="mt-2 pt-2 border-t border-white/10">
            <span className="text-[9px] text-white/40 uppercase tracking-[0.1em]">Powered by Groq</span>
          </div>
        </div>
      )}
    </div>
  );
}
