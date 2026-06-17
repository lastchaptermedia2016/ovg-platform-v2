'use client';

import { useEffect } from 'react';
import { useHannah } from '@/contexts/HannahContext';
import type { CommandCapability } from '@/core/ai/system-capabilities';

const REVENUE_COMMANDS: CommandCapability[] = [
  {
    key: 'VIEW_MRR',
    name: "What's my total MRR?",
    description: 'Displays the total Monthly Recurring Revenue across all clients.',
    examples: ["What's my MRR?", 'Show me total MRR', 'How much MRR do I have?'],
  },
  {
    key: 'VIEW_ACTIVE_CLIENTS',
    name: 'How many active clients do I have?',
    description: 'Shows the total count of active client tenants in your portfolio.',
    examples: ['How many clients?', 'Show active clients', 'Client count'],
  },
  {
    key: 'VIEW_AI_EFFICIENCY',
    name: "What's my AI efficiency?",
    description: 'Displays the AI system efficiency percentage based on signal telemetry.',
    examples: ['What is my AI efficiency?', 'Show AI efficiency', 'How efficient is my AI?'],
  },
  {
    key: 'VIEW_REVENUE_BREAKDOWN',
    name: 'Show revenue breakdown',
    description: 'Provides a per-client breakdown of revenue and plan tiers.',
    examples: ['Break down revenue', 'Show per-client revenue', 'Revenue breakdown'],
  },
];

export function RevenueCommandRegistrar() {
  const { setActiveCommands } = useHannah();

  useEffect(() => {
    setActiveCommands(REVENUE_COMMANDS);
    return () => {
      setActiveCommands([]);
    };
  }, [setActiveCommands]);

  return null;
}