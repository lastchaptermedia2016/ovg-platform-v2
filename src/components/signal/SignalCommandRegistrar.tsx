'use client';

import { useEffect } from 'react';
import { useHannah } from '@/contexts/HannahContext';
import type { CommandCapability } from '@/core/ai/system-capabilities';

const SIGNAL_COMMANDS: CommandCapability[] = [
  {
    key: 'FILTER_ERROR',
    name: 'Filter error',
    description: 'Filters the signal telemetry to show only error-level events.',
    examples: ['Filter error', 'Show only errors', 'Error signals'],
  },
  {
    key: 'FILTER_CRITICAL',
    name: 'Filter critical',
    description: 'Filters the signal telemetry to show only critical events.',
    examples: ['Filter critical', 'Show critical only', 'Critical signals'],
  },
  {
    key: 'FILTER_ALL',
    name: 'Filter all',
    description: 'Resets the signal filter to show all severity levels.',
    examples: ['Filter all', 'Show all signals', 'Filter standard'],
  },
  {
    key: 'PAUSE_STREAMING',
    name: 'Pause streaming',
    description: 'Suspends the live signal telemetry ticker.',
    examples: ['Pause streaming', 'Pause ticker', 'Stop streaming'],
  },
  {
    key: 'RESUME_STREAMING',
    name: 'Resume streaming',
    description: 'Resumes the live signal telemetry ticker after pause.',
    examples: ['Resume streaming', 'Resume ticker', 'Start streaming'],
  },
];

export function SignalCommandRegistrar() {
  const { setActiveCommands } = useHannah();

  useEffect(() => {
    setActiveCommands(SIGNAL_COMMANDS);
    return () => {
      setActiveCommands([]);
    };
  }, [setActiveCommands]);

  return null;
}