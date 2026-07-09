'use client';

import { ClientSystemModal } from '@/components/client/ClientSystemModal';

export interface CapabilitiesModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Thin proxy retained for parity.audit.test.ts (FEATURE_REGISTRY.SYSTEM_HELP.uiModal
 * expects this file path on disk) and to avoid breaking existing import hooks.
 * All UI logic now lives in ClientSystemModal.
 */
export function CapabilitiesModal({ open, onClose }: CapabilitiesModalProps) {
  return <ClientSystemModal open={open} onClose={onClose} defaultCategory="general" />;
}
