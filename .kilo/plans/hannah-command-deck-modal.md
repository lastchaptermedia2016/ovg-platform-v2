# Hannah Command Deck Modal Implementation Plan

## Overview
Create a reusable `<HannahCommandDeck />` modal component for context-aware system command display, integrating into the existing layout and state management.

## Target Files

### 1. New Component
- `src/components/hannah/HannahCommandDeck.tsx` — New reusable modal component

### 2. Modified Context
- `src/contexts/HannahContext.tsx` — Add `isCommandDeckOpen`, `setCommandDeckOpen` state

### 3. Modified Layout
- `src/app/(dashboard)/reseller/[resellerSlug]/layout.tsx` — Inject modal overlay

## Component Design Specification

Based on the existing SYSTEM_HELP popover in `clients/page.tsx` (lines 892-944):

### Visual Structure
```tsx
// Modal backdrop with fade-in
<div className="fixed inset-0 z-[100] flex items-center justify-center">
  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
  
  {/* Modal container */}
  <div className="relative max-w-md w-full mx-4 rounded-xl bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 overflow-hidden">
    
    {/* Header */}
    <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse shadow-[0_0_8px_rgba(0,229,255,0.6)]" />
        <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#00e5ff] drop-shadow-[0_0_6px_rgba(0,229,255,0.3)]">
          AVAILABLE COMMANDS
        </span>
      </div>
      <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors text-sm leading-none">
        ✕
      </button>
    </div>
    
    {/* Command List - handle empty array gracefully */}
    <div className="px-4 py-4 space-y-2">
      {commands.map((cmd, idx) => (
        <div key={idx} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/5 ...">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0097b2]/60 ..." />
          <span className="text-[11px] font-medium text-white/80 ...">{cmd.title}</span>
          <span className="ml-auto text-[7px] text-white/20 tracking-wider uppercase">VOICE</span>
        </div>
      ))}
    </div>
    
    {/* Footer Status Bar */}
    <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
      <span className="text-[8px] text-white/30 tracking-wider">Click outside or press Esc to dismiss</span>
      <span className="text-[8px] text-[#0097b2]/60 tracking-wider font-medium">{commands.length} commands available</span>
    </div>
  </div>
</div>
```

## HannahContext Changes

Add command deck state:
```tsx
export interface HannahContextValue {
  // ... existing fields
  isCommandDeckOpen: boolean;
  setCommandDeckOpen: (open: boolean) => void;
  activeCommands: CommandCapability[];
  setActiveCommands: (commands: CommandCapability[]) => void;
}
```

## Hook Integration Snippet

Components will consume via `useHannah()`:
```tsx
const { isCommandDeckOpen, setCommandDeckOpen, activeCommands } = useHannah();

// Toggle via keyboard or external trigger
useEffect(() => {
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setCommandDeckOpen(false);
  };
  window.addEventListener('keydown', handleEscape);
  return () => window.removeEventListener('keydown', handleEscape);
}, [setCommandDeckOpen]);

// External trigger example
<button onClick={() => {
  setActiveCommands(Object.values(SYSTEM_CAPABILITIES));
  setCommandDeckOpen(true);
}}>
  Show Commands
</button>
```

## Implementation Steps

1. Create `src/components/hannah/` directory
2. Create `HannahCommandDeck.tsx` with modal structure
3. Update `HannahContext.tsx` with command deck state
4. Update `layout.tsx` to render `<HannahCommandDeck />` as portal
5. Add Escape key handler in layout for global dismissal
6. Run lint and build to verify

## Guardrails
- Handle empty `activeCommands` array gracefully
- Match exact styling from image_f76486.png (using existing popover as reference)
- Maintain z-index above other components (z-[100])
- Ensure click-outside dismissal works correctly