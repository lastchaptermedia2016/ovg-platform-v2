'use client';

interface SystemStatusMonitorProps {
  statusItems: {
    label: string;
    value: string;
    status: string | null;
    statusColor: string;
  }[];
}

export default function SystemStatusMonitor({ statusItems: _statusItems }: SystemStatusMonitorProps) {
  return null;
}
