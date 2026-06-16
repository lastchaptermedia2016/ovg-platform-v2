'use client';

import { HannahCommandDeck } from '@/components/hannah/HannahCommandDeck';
import { useHannah } from '@/contexts/HannahContext';

export function CommandDeckPortal() {
  const { isCommandDeckOpen, setCommandDeckOpen, activeCommands } = useHannah();

  return (
    <HannahCommandDeck
      isOpen={isCommandDeckOpen}
      onClose={() => setCommandDeckOpen(false)}
      commands={activeCommands}
    />
  );
}