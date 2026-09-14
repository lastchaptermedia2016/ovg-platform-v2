'use client';

import { ReactNode } from 'react';
import { HannahProvider } from '@/contexts/HannahContext';
import { CommandDeckProvider } from '@/contexts/CommandDeckContext';
import { CommandDeckPortal } from '@/components/hannah/CommandDeckPortal';
import { GlobalPTTListener } from '@/components/reseller/GlobalPTTListener';

export function ResellerLayoutClient({ children, resellerSlug }: { children: ReactNode; resellerSlug: string }) {
  return (
    <CommandDeckProvider>
      <HannahProvider resellerSlug={resellerSlug}>
        <GlobalPTTListener />
        <CommandDeckPortal />
        {children}
      </HannahProvider>
    </CommandDeckProvider>
  );
}
