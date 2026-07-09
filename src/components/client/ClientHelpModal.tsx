'use client';

import { ClientSystemModal } from '@/components/client/ClientSystemModal';

export interface ClientHelpModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Thin proxy retained for parity.audit.test.ts and existing import hooks.
 * All UI logic now lives in ClientSystemModal.
 */
export function ClientHelpModal({ open, onClose }: ClientHelpModalProps) {
  return <ClientSystemModal open={open} onClose={onClose} defaultCategory="general" />;
}
