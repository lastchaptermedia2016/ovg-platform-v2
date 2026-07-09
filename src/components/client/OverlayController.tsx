'use client';

import { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { CommandModal } from '@/components/client/CommandModal';

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────
type OverlayView = 'commands' | null;
type CommandIntent = 'list_capabilities' | 'view_status' | 'get_help' | 'show_analytics';

interface OverlayControllerProps {
  /** Optional initial view when mounted */
  defaultView?: OverlayView;
  /** Latest detected command intent to display */
  commandIntent?: 'list_capabilities' | 'view_status' | 'get_help' | 'show_analytics' | null;
  /** Called when the command modal requests close */
  onCommandClose?: () => void;
  clientProfile?: { resellerSlug?: string } | null;
}

// ────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────
export const OverlayController = forwardRef<
  { openCommands: () => void },
  OverlayControllerProps
>(function OverlayController({ defaultView = null, commandIntent, onCommandClose: _onCommandClose, clientProfile }, ref) {
  const [view, setView] = useState<OverlayView>(defaultView);
  const [commandIntentState, setCommandIntent] = useState<CommandIntent | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Ensure portal target exists on client
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const openCommands = useCallback(() => setView('commands'), []);
  const close = useCallback(() => {
    setView(null);
    setCommandIntent(null);
  }, []);

  // Bridge: open commands modal when commandIntent changes (from postMessage listener)
  useEffect(() => {
    if (commandIntent) {
      setCommandIntent(commandIntent);
      openCommands();
    }
  }, [commandIntent, openCommands]);

  const handleCommandClose = () => {
    setView(null);
    setCommandIntent(null);
  };

  useImperativeHandle(ref, () => ({ openCommands }), [openCommands]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [view, close]);

  // Prevent body scroll when overlay is open
  useEffect(() => {
    if (!view) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [view]);

  // Nothing to render if closed
  if (!view || !isMounted) return null;

  return (
    <CommandModal
      open
      intent={commandIntentState}
      onClose={handleCommandClose}
      clientProfile={clientProfile}
    />
  );
});

export default OverlayController;
