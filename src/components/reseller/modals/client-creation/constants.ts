import type { FormState, VoiceEntryData, VoiceEntryStep } from './types';

/** Initial atomic manual-entry form state (single source of truth). */
export const INITIAL_FORM_STATE: FormState = {
  name: '',
  email: '',
  industry: 'GENERAL BUSINESS',
  category: '',
  mobile: '',
  website: '',
  systemPrompt: '',
};

/** Initial (empty) guided voice-entry capture state. */
export const INITIAL_VOICE_ENTRY_DATA: VoiceEntryData = {
  name: '',
  industry: '',
  category: '',
  email: '',
  mobile: '',
  website: '',
  vibe: '',
};

/** Spoken prompt for each voice entry step (auto-read on transition). */
export const STEP_VOICE_PROMPTS: Record<number, string> = {
  0: "What is the client's name and industry?",
  1: "What's their email address?",
  2: "What is their category or mobile number?",
  3: "What is their website URL?",
  4: "Finally, describe their business vibe or personality in a few words.",
};

/** On-screen instruction for each voice entry step. */
export const STEP_INSTRUCTIONS: Record<VoiceEntryStep, string> = {
  0: 'Tell me the client name and industry',
  1: "What's their email address?",
  2: 'Category or mobile number',
  3: 'What is their website URL?',
  4: 'Describe their business vibe',
};

/** Category options keyed by industry. */
export const INDUSTRY_CATEGORY_MAP: Record<string, string[]> = {
  AUTOMOTIVE: ['VIN_DECODE', 'LOGISTICS', 'RETAIL_SALES'],
  RETAIL: ['ECOMMERCE', 'BRICK_AND_MORTAR'],
  HEALTHCARE: ['CLINICAL', 'WELLNESS'],
  INSURANCE: ['CLAIMS', 'UNDERWRITING'],
  'AI AUTOMATION': ['AGENTIC_AI', 'WORKFLOW_AUTOMATION', 'CHATBOT'],
  'GENERAL BUSINESS': ['GENERAL', 'CONSULTING', 'SERVICES'],
};

/** Industries offered by the manual-form and review-step pickers. */
export const INDUSTRY_OPTIONS = [
  'AUTOMOTIVE',
  'RETAIL',
  'HEALTHCARE',
  'INSURANCE',
  'AI AUTOMATION',
  'GENERAL BUSINESS',
];

export const getCategoriesForIndustry = (ind: string): string[] =>
  INDUSTRY_CATEGORY_MAP[ind.toUpperCase().trim()] ?? INDUSTRY_CATEGORY_MAP['GENERAL BUSINESS'];

// ─── Step-Gating Requirements ────────────────────────────────────────
// Defines REQUIRED fields for each voiceEntryStep. Step advancement is BLOCKED
// until ALL required fields for the current step are present and non-empty.
export const STEP_REQUIREMENTS: Record<VoiceEntryStep, (keyof VoiceEntryData)[]> = {
  0: ['name', 'industry'],
  1: ['email'],
  2: ['category', 'mobile'],
  3: ['website'],
  4: ['vibe'],
};

export function getMissingRequiredFields(step: VoiceEntryStep, data: VoiceEntryData): (keyof VoiceEntryData)[] {
  const required = STEP_REQUIREMENTS[step];
  if (step === 2) {
    const hasCategory = data.category && data.category.trim() !== '';
    const hasMobile = data.mobile && data.mobile.trim() !== '';
    if (hasCategory || hasMobile) return [];
    return ['category', 'mobile'];
  }
  return required.filter((field) => !data[field] || data[field].trim() === '');
}

export function getRepromptMessage(missingFields: (keyof VoiceEntryData)[]): string {
  if (missingFields.length === 0) return '';
  const field = missingFields[0];
  const prompts: Record<keyof VoiceEntryData, string> = {
    name: "I need the client name to continue.",
    industry: "What industry is this client in?",
    category: "What category or use case?",
    email: "What's their email address?",
    mobile: "What's their mobile number?",
    website: "What's their website address?",
    vibe: "Describe their business vibe or personality.",
  };
  return prompts[field] || `Please provide the ${field}.`;
}
