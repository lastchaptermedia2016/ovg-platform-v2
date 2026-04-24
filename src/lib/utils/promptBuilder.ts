/**
 * Prompt Builder Utility
 * Merges bot personality with custom directives for AI API calls
 */

interface PromptBuilderOptions {
  botPersonality: 'professional' | 'aggressive' | 'informational';
  customDirectives: string;
  template: 'general' | 'automotive';
}

const personalityBasePrompts = {
  professional: 'You are a professional, courteous AI assistant. Maintain a formal tone, be helpful and accurate, and prioritize providing clear, well-structured information.',
  aggressive: 'You are a high-energy sales-focused AI assistant. Be enthusiastic, persuasive, and focus on closing deals. Use confident language and create urgency when appropriate.',
  informational: 'You are a helpful, educational AI assistant. Focus on providing detailed information, explaining concepts clearly, and helping users learn.',
};

const templateContext = {
  general: 'You are assisting with general business inquiries.',
  automotive: 'You are assisting with automotive dealership inquiries including vehicle browsing, test drives, and trade-in options.',
};

export function buildPrompt(options: PromptBuilderOptions): string {
  const { botPersonality, customDirectives, template } = options;

  // Start with personality base
  let prompt = personalityBasePrompts[botPersonality];

  // Add template context
  prompt += `\n\n${templateContext[template]}`;

  // Add custom directives if provided
  if (customDirectives && customDirectives.trim()) {
    prompt += `\n\nAdditional Instructions:\n${customDirectives.trim()}`;
  }

  return prompt;
}

/**
 * Example usage:
 * const prompt = buildPrompt({
 *   botPersonality: 'aggressive',
 *   customDirectives: 'Always mention our 0% financing offers',
 *   template: 'automotive'
 * });
 */
