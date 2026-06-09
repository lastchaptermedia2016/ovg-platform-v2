'use client';

import { useState, useRef, useCallback } from 'react';

interface SystemHelpTooltipProps {
  /** The trigger element that reveals the tooltip on hover */
  children: React.ReactNode;
  /** Optional external visibility control */
  isVisible?: boolean;
}

/**
 * SystemHelpTooltip — Glassmorphic hover tooltip for Quick Commands discovery.
 * 
 * Attaches to the SYSTEM microphone button to provide passive visual command discovery.
 * Styled with the existing dashboard design system (backdrop-blur, slate-900/50, etc.).
 * 
 * Quick Commands list:
 * - Delete
 * - Filter
 * - Deploy
 * - Help
 */
export function SystemHelpTooltip({ children, isVisible: externalVisible }: SystemHelpTooltipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isOpen = externalVisible ?? (isHovered || isFocused);

  const handleMouseEnter = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    // Small delay to allow cursor to reach tooltip
    hideTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 150);
  }, []);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  const quickCommands = [
    { label: 'Delete', description: 'Remove a client by name' },
    { label: 'Filter', description: 'Filter grid by industry or sector' },
    { label: 'Deploy', description: 'Apply config updates to clients' },
    { label: 'Custom CSS', description: 'Inject raw CSS overrides for glassmorphism and layout' },
    { label: 'Logo', description: 'Upload or change the widget header brand logo' },
    { label: 'Help', description: 'List all available voice commands' },
  ];

  return (
    <div
      ref={containerRef}
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      tabIndex={-1}
    >
      {/* Trigger — wraps the mic button */}
      {children}

      {/* Glassmorphic Tooltip */}
      <div
        className={`
          absolute bottom-full left-1/2 -translate-x-1/2 mb-3
          transition-all duration-300 ease-out
          ${isOpen
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-2 pointer-events-none'
          }
          z-[100] min-w-[200px]
        `}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Arrow pointing down to the trigger */}
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-slate-900/70 backdrop-blur-xl border-r border-b border-white/10" />

        {/* Tooltip Body — Glassmorphic Card */}
        <div className="relative rounded-xl bg-slate-900/70 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-2.5 border-b border-white/5">
            <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-[#00e5ff] drop-shadow-[0_0_6px_rgba(0,229,255,0.3)]">
              Quick Commands
            </span>
          </div>

          {/* Command List */}
          <div className="px-2 py-2 space-y-0.5">
            {quickCommands.map((cmd) => (
              <div
                key={cmd.label}
                className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors duration-150 group"
              >
                <span className="text-[10px] font-bold tracking-widest text-white group-hover:text-[#00e5ff] transition-colors duration-150">
                  {cmd.label}
                </span>
                <span className="text-[8px] text-white/40 tracking-wider max-w-[110px] text-right leading-tight">
                  {cmd.description}
                </span>
              </div>
            ))}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-1.5 border-t border-white/5">
            <span className="text-[7px] text-white/30 tracking-wider">
              Say &ldquo;Help&rdquo; or &ldquo;What can you do?&rdquo;
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}