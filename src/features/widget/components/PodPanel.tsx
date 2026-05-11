import React from 'react';
import PodBubble from '@/components/widget/PodBubble';

export interface PodPanelProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  voiceId?: string | null;
  name?: string;
}

export default function PodPanel(props: PodPanelProps) {
  return <PodBubble {...props} />;
}
