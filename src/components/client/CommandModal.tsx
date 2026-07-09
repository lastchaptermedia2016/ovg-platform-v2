'use client';

import { ClientSystemModal } from '@/components/client/ClientSystemModal';

type CommandIntent = 'list_capabilities' | 'view_status' | 'get_help' | 'show_analytics';

interface CommandModalProps {
  open: boolean;
  intent: CommandIntent | null;
  onClose: () => void;
  clientProfile?: { resellerSlug?: string } | null;
}

/**
 * Thin proxy retained for parity.audit.test.ts and existing import hooks.
 * All UI logic now lives in ClientSystemModal.
 */
export function CommandModal({ open, intent, onClose, clientProfile }: CommandModalProps) {
  return (
    <ClientSystemModal
      open={open}
      onClose={onClose}
      intent={intent}
      clientProfile={clientProfile}
      defaultCategory="general"
    />
  );
}
