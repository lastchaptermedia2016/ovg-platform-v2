'use client';

import { Sparkles } from 'lucide-react';

export function AIInsight() {
  return (
    <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-2xl select-none">
      {/* Thought bubble pointer */}
      <div className="absolute -left-3 top-8 w-6 h-6 bg-white/5 backdrop-blur-md border-l border-t border-white/10 transform rotate-45 pointer-events-none" />
      
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-full bg-[#0097b2]/20 flex-shrink-0">
          <Sparkles className="w-4 h-4 text-[#0097b2]" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-white mb-2 tracking-tight">AI Insight</h4>
          <p className="text-xs text-white/70 leading-relaxed">
            Your dealership clients are showing a <span className="text-[#d4af37] font-medium">23% increase</span> in lead conversion this week. Consider expanding the automotive template to your SaaS clients who show similar engagement patterns.
          </p>
        </div>
      </div>
      
      {/* Subtle glow effect */}
      <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{
        background: 'radial-gradient(circle at 30% 30%, rgba(0,151,178,0.1) 0%, transparent 50%)'
      }} />
    </div>
  );
}
