// Hannah's Service Catalog - High-Skill Assistant Persona
export interface ServiceCapability {
  name: string;
  description: string;
  category: 'branding' | 'design' | 'optimization' | 'analytics';
  triggers: string[];
  contextual?: boolean;
}

export interface IndustryRecommendation {
  industry: string;
  recommendations: {
    headerType: 'solid' | 'gradient' | 'image';
    colorScheme: string[];
    opacity: number;
    features: string[];
    reasoning: string;
  };
}

export const SERVICE_CATALOG: ServiceCapability[] = [
  {
    name: 'Brand Sync',
    description: 'Pull brand colors and assets from their website',
    category: 'branding',
    triggers: ['sync brand', 'pull colors', 'get brand', 'sync website'],
    contextual: true,
  },
  {
    name: 'Industry Vibe',
    description: 'Apply industry-specific professional branding',
    category: 'branding',
    triggers: ['industry vibe', 'professional look', 'apply industry'],
    contextual: true,
  },
  {
    name: 'Glassmorphism Design',
    description: 'Apply modern glassmorphic effects with transparency',
    category: 'design',
    triggers: ['glass', 'glassmorphism', 'transparent', 'frosted'],
  },
  {
    name: 'Color Harmony',
    description: 'Optimize color combinations for visual appeal',
    category: 'design',
    triggers: ['harmony', 'colors', 'improve colors', 'color scheme'],
  },
  {
    name: 'Opacity Tuning',
    description: 'Adjust transparency for optimal readability',
    category: 'design',
    triggers: ['opacity', 'transparency', 'see through', 'clear'],
  },
  {
    name: 'Full Design Pass',
    description: 'Complete brand analysis and design application',
    category: 'optimization',
    triggers: ['do your thing', 'show me what you got', 'full pass', 'magic'],
  },
  {
    name: 'A/B Testing Setup',
    description: 'Prepare multiple design variations',
    category: 'analytics',
    triggers: ['test', 'variations', 'a/b test', 'options'],
  },
];

export const INDUSTRY_RECOMMENDATIONS: IndustryRecommendation[] = [
  {
    industry: 'Finance',
    recommendations: {
      headerType: 'solid',
      colorScheme: ['#1e3a8a', '#1e40af', '#2563eb'],
      opacity: 0.95,
      features: ['aiInsightBadge'],
      reasoning: 'Solid headers convey stability and security in finance',
    },
  },
  {
    industry: 'Technology',
    recommendations: {
      headerType: 'gradient',
      colorScheme: ['#0891b2', '#0e7490', '#155e75'],
      opacity: 0.85,
      features: ['aiInsightBadge', 'aiDesignMirror'],
      reasoning: 'Gradients suggest innovation and modern tech aesthetics',
    },
  },
  {
    industry: 'Healthcare',
    recommendations: {
      headerType: 'solid',
      colorScheme: ['#059669', '#047857', '#065f46'],
      opacity: 0.9,
      features: ['aiInsightBadge'],
      reasoning: 'Clean solid colors build trust in healthcare',
    },
  },
  {
    industry: 'Real Estate',
    recommendations: {
      headerType: 'image',
      colorScheme: ['#dc2626', '#b91c1c', '#991b1b'],
      opacity: 0.75,
      features: ['aiDesignMirror'],
      reasoning: 'Image headers showcase properties effectively',
    },
  },
  {
    industry: 'E-commerce',
    recommendations: {
      headerType: 'gradient',
      colorScheme: ['#ea580c', '#dc2626', '#b91c1c'],
      opacity: 0.8,
      features: ['aiInsightBadge', 'customCss'],
      reasoning: 'Bold gradients drive conversions and attention',
    },
  },
  {
    industry: 'Professional Services',
    recommendations: {
      headerType: 'solid',
      colorScheme: ['#475569', '#334155', '#1e293b'],
      opacity: 0.9,
      features: ['aiInsightBadge'],
      reasoning: 'Professional solid colors convey expertise',
    },
  },
];

export const PLAN_TIER_CAPABILITIES = {
  standard: {
    maxFeatures: 1,
    allowedCategories: ['branding', 'design'],
    limitations: 'Basic branding and design tweaks',
  },
  premium: {
    maxFeatures: 2,
    allowedCategories: ['branding', 'design', 'optimization'],
    limitations: 'Advanced design with optimization',
  },
  enterprise: {
    maxFeatures: 3,
    allowedCategories: ['branding', 'design', 'optimization', 'analytics'],
    limitations: 'Full suite including analytics',
  },
};

export function getCapabilityBriefing(clientId: string, industry?: string, planTier?: string): string {
  const capabilities = SERVICE_CATALOG.filter(cap => 
    !cap.contextual || (planTier && PLAN_TIER_CAPABILITIES[planTier as keyof typeof PLAN_TIER_CAPABILITIES]?.allowedCategories.includes(cap.category))
  );
  
  const tierInfo = planTier ? PLAN_TIER_CAPABILITIES[planTier as keyof typeof PLAN_TIER_CAPABILITIES] : null;
  
  let briefing = `I'm Hannah, your AI design assistant. I can help you `;
  
  const capabilityList = capabilities.slice(0, 3).map(cap => cap.description.toLowerCase()).join(', ');
  briefing += capabilityList;
  
  if (tierInfo) {
    briefing += `. With your ${planTier} plan, ${tierInfo.limitations.toLowerCase()}`;
  }
  
  if (industry) {
    const industryRec = INDUSTRY_RECOMMENDATIONS.find(rec => 
      rec.industry.toLowerCase() === industry.toLowerCase()
    );
    if (industryRec) {
      briefing += `. For ${industry} clients, I recommend ${industryRec.recommendations.reasoning.toLowerCase()}`;
    }
  }
  
  briefing += `. Just tell me what you'd like to explore!`;
  
  return briefing;
}

export function getContextualSuggestion(industry?: string, planTier?: string): string {
  if (industry) {
    const industryRec = INDUSTRY_RECOMMENDATIONS.find(rec => 
      rec.industry.toLowerCase() === industry.toLowerCase()
    );
    if (industryRec) {
      return `Since they're in ${industry}, I recommend a '${industryRec.recommendations.headerType}' header for ${industryRec.recommendations.reasoning.toLowerCase()}. Want me to apply that?`;
    }
  }
  
  if (planTier === 'standard') {
    return "With your plan, I can help you establish a solid brand foundation. Shall we start with color harmony?";
  } else if (planTier === 'premium') {
    return "Your plan unlocks advanced design features. I could create a stunning glassmorphic effect - interested?";
  } else if (planTier === 'enterprise') {
    return "You have access to my full capabilities. I can run a complete brand analysis and design optimization. Ready for the full experience?";
  }
  
  return "I can help you create a professional brand presence. Where should we start?";
}

export function getActionValidation(action: string, value: any, context?: any): string {
  const validations = {
    color: [
      "That color choice really works well with the overall design.",
      "Excellent color selection - it creates great visual hierarchy.",
      "Nice! That color adds the perfect touch of personality.",
    ],
    opacity: [
      "Perfect transparency level - maintains readability while looking modern.",
      "Great opacity choice - gives it that premium glassmorphic feel.",
      "Smart adjustment - that transparency really enhances the design.",
    ],
    gradient: [
      "Beautiful gradient transition - very professional and eye-catching.",
      "Love those color choices - creates excellent depth and dimension.",
      "Perfect gradient flow - really makes the header stand out.",
    ],
    image: [
      "Great image selection - adds excellent visual context.",
      "Perfect background choice - really tells their brand story.",
      "Excellent visual - creates immediate brand recognition.",
    ],
  };
  
  const category = action.includes('color') ? 'color' : 
                   action.includes('opacity') ? 'opacity' : 
                   action.includes('gradient') ? 'gradient' : 
                   action.includes('image') ? 'image' : 'color';
  
  const validationList = validations[category as keyof typeof validations];
  return validationList[Math.floor(Math.random() * validationList.length)];
}
