'use client';

import { useEffect } from 'react';
import { useHannah } from '@/contexts/HannahContext';
import type { CommandCapability } from '@/core/ai/system-capabilities';

const AI_ENGINE_COMMANDS: CommandCapability[] = [
  {
    key: 'APPLY_HEALTHCARE_PRESET',
    name: 'Apply the healthcare preset',
    description: 'Switches the AI engine to the healthcare industry preset with medical terminology and professional tone.',
    examples: ['Apply healthcare', 'Switch to healthcare', 'Healthcare preset'],
  },
  {
    key: 'APPLY_AUTOMOTIVE_PRESET',
    name: 'Apply the automotive preset',
    description: 'Switches the AI engine to the automotive industry preset with dealership terminology.',
    examples: ['Apply automotive', 'Switch to automotive', 'Automotive preset'],
  },
  {
    key: 'APPLY_GENERAL_PRESET',
    name: 'Apply the general business preset',
    description: 'Switches the AI engine to the general business preset.',
    examples: ['Apply general business', 'Switch to general', 'General business preset'],
  },
  {
    key: 'APPLY_RETAIL_PRESET',
    name: 'Apply the retail preset',
    description: 'Switches the AI engine to the retail industry preset.',
    examples: ['Apply retail', 'Switch to retail', 'Retail preset'],
  },
  {
    key: 'APPLY_INSURANCE_PRESET',
    name: 'Apply the insurance preset',
    description: 'Switches the AI engine to the insurance industry preset.',
    examples: ['Apply insurance', 'Switch to insurance', 'Insurance preset'],
  },
  {
    key: 'APPLY_AI_AUTOMATION_PRESET',
    name: 'Apply the AI automation preset',
    description: 'Switches the AI engine to the AI automation industry preset.',
    examples: ['Apply AI automation', 'Switch to AI automation', 'AI automation preset'],
  },
  {
    key: 'TOGGLE_CALENDAR_SYNC',
    name: 'Toggle calendar sync',
    description: 'Enables or disables the calendar integration for the AI assistant.',
    examples: ['Toggle calendar', 'Enable calendar sync', 'Disable calendar'],
  },
  {
    key: 'SAVE_INTEGRATION',
    name: 'Save integration',
    description: 'Persists the current AI engine configuration and integration settings.',
    examples: ['Save integration', 'Save settings', 'Apply configuration'],
  },
];

export function AiEngineCommandRegistrar() {
  const { setActiveCommands } = useHannah();

  useEffect(() => {
    setActiveCommands(AI_ENGINE_COMMANDS);
    return () => {
      setActiveCommands([]);
    };
  }, [setActiveCommands]);

  return null;
}