'use client';

interface ControlPanelProps {
  pipelineLayers: {
    layer: string;
    subtext: string;
  }[];
  autoSync: boolean;
  realtimeUpdates: boolean;
}

export default function ControlPanel({ pipelineLayers: _pipelineLayers, autoSync: _autoSync, realtimeUpdates: _realtimeUpdates }: ControlPanelProps) {
  return null;
}
