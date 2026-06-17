'use client';

import { HannahCommandDeck } from '@/components/hannah/HannahCommandDeck';
import { useCommandDeck } from '@/contexts/CommandDeckContext';
import { useHannah } from '@/contexts/HannahContext';

export function CommandDeckPortal() {
  const { isCommandDeckOpen, setCommandDeckOpen } = useCommandDeck();
  const { activeCommands } = useHannah();

  return (
    <HannahCommandDeck
      isOpen={isCommandDeckOpen}
      onClose={() => setCommandDeckOpen(false)}
      commands={activeCommands}
    />
  );
}