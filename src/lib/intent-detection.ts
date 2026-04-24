/**
 * Intent Detection & Pattern Matching System
 * 
 * Scans user messages before LLM processing to detect:
 * - High-value sales opportunities
 * - User frustration/escalation needs
 * - Direct human handover requests
 */

export type IntentType = 
  | "pricing" 
  | "frustration" 
  | "human_request" 
  | "sales_opportunity" 
  | "complaint" 
  | "urgent";

export interface DetectedIntent {
  type: IntentType;
  confidence: number; // 0-1
  triggerWord: string;
  severity: "low" | "medium" | "high" | "critical";
  suggestedAction: string;
}

// High-Value Pattern Definitions
const INTENT_PATTERNS: Record<IntentType, { patterns: RegExp[]; severity: DetectedIntent["severity"]; weight: number }> = {
  pricing: {
    patterns: [
      /\b(price|pricing|cost|how much|quote|estimate|budget|payment|pay for|charge|fee)\b/gi,
      /\b(discount|deal|offer|special price|negotiate|cheaper|expensive|affordable)\b/gi,
      /\b(monthly|annual|subscription|plan tier|package cost)\b/gi,
    ],
    severity: "high",
    weight: 0.9,
  },
  frustration: {
    patterns: [
      /\b(frustrated|annoying|useless|waste of time|not working|broken|terrible|awful)\b/gi,
      /\b(stupid|idiot|hate this|doesn't work|never works|constant problem)\b/gi,
      /\b(fed up|had enough|this is ridiculous|what's the point)\b/gi,
    ],
    severity: "high",
    weight: 0.85,
  },
  human_request: {
    patterns: [
      /\b(talk to human|speak to person|real agent|live agent|human please|not a bot)\b/gi,
      /\b(connect me to|transfer to|get me a|i want a human|real person)\b/gi,
      /\b(customer service|support team|manager|supervisor)\b/gi,
    ],
    severity: "critical",
    weight: 1.0,
  },
  sales_opportunity: {
    patterns: [
      /\b(buy|purchase|order|sign up|get started|interested in|looking for)\b/gi,
      /\b(upgrade|add more|additional|expand|enterprise|business solution)\b/gi,
      /\b(demo|trial|sample|see it in action|schedule call|book meeting)\b/gi,
    ],
    severity: "medium",
    weight: 0.75,
  },
  complaint: {
    patterns: [
      /\b(complaint|refund|cancel|unsubscribe|stop charging|billing issue)\b/gi,
      /\b(unhappy|dissatisfied|poor service|bad experience|scam|fraud)\b/gi,
    ],
    severity: "high",
    weight: 0.9,
  },
  urgent: {
    patterns: [
      /\b(urgent|emergency|asap|immediately|right now|critical|crisis)\b/gi,
      /\b(system down|not responding|can't access|locked out|security breach)\b/gi,
    ],
    severity: "critical",
    weight: 1.0,
  },
};

/**
 * Scan message for intent patterns
 * Returns detected intents sorted by confidence
 */
export function scanIntent(message: string): DetectedIntent[] {
  const detected: DetectedIntent[] = [];
  const messageLower = message.toLowerCase();

  for (const [intentType, config] of Object.entries(INTENT_PATTERNS)) {
    let matchCount = 0;
    let matchedPattern = "";

    for (const pattern of config.patterns) {
      const matches = messageLower.match(pattern);
      if (matches) {
        matchCount += matches.length;
        matchedPattern = matches[0]; // Store first match as trigger word
      }
    }

    if (matchCount > 0) {
      // Calculate confidence based on match count and weight
      const baseConfidence = Math.min(matchCount * 0.3, 0.9);
      const confidence = Math.min(baseConfidence + config.weight * 0.1, 1.0);

      detected.push({
        type: intentType as IntentType,
        confidence,
        triggerWord: matchedPattern,
        severity: config.severity,
        suggestedAction: getSuggestedAction(intentType as IntentType),
      });
    }
  }

  // Sort by confidence descending
  return detected.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Check if message requires immediate human attention
 */
export function requiresHumanAttention(intents: DetectedIntent[]): boolean {
  return intents.some(
    (intent) =>
      intent.severity === "critical" ||
      (intent.severity === "high" && intent.confidence > 0.8)
  );
}

/**
 * Get the highest priority intent
 */
export function getPriorityIntent(intents: DetectedIntent[]): DetectedIntent | null {
  if (intents.length === 0) return null;
  return intents[0]; // Already sorted by confidence
}

function getSuggestedAction(intentType: IntentType): string {
  const actions: Record<IntentType, string> = {
    pricing: "Offer pricing consultation or schedule sales call",
    frustration: "Escalate to support with empathy acknowledgment",
    human_request: "Immediately transfer to live agent",
    sales_opportunity: "Provide product demo link or sales contact",
    complaint: "Escalate to retention team with priority flag",
    urgent: "Immediate manager notification + live agent transfer",
  };
  return actions[intentType];
}

/**
 * Format intent for alert payload
 */
export function formatAlertPayload(
  conversationId: string,
  tenantId: string,
  message: string,
  intents: DetectedIntent[]
): {
  conversation_id: string;
  tenant_id: string;
  trigger_word: string;
  intent_type: IntentType;
  severity: string;
  message_preview: string;
  timestamp: string;
  deep_link: string;
  suggested_action: string;
  confidence: number;
} {
  const priorityIntent = getPriorityIntent(intents);
  
  return {
    conversation_id: conversationId,
    tenant_id: tenantId,
    trigger_word: priorityIntent?.triggerWord || "unknown",
    intent_type: priorityIntent?.type || "sales_opportunity",
    severity: priorityIntent?.severity || "medium",
    message_preview: message.substring(0, 100) + (message.length > 100 ? "..." : ""),
    timestamp: new Date().toISOString(),
    deep_link: `/dashboard/conversations/${conversationId}?intent=${priorityIntent?.type}`,
    suggested_action: priorityIntent?.suggestedAction || "Review conversation",
    confidence: priorityIntent?.confidence || 0.5,
  };
}
