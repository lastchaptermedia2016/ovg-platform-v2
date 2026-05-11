// Voice-Visual Harmony Sprint - Persona Mapping & Greeting Generation

export interface VoicePersona {
  tone: 'professional' | 'friendly' | 'energetic' | 'luxury' | 'tech' | 'warm';
  vocabulary: 'formal' | 'casual' | 'technical' | 'inspiring' | 'welcoming';
  pace: 'slow' | 'medium' | 'fast';
  energy: 'calm' | 'moderate' | 'high';
}

export interface VisualStyle {
  headerType: 'solid' | 'gradient' | 'image';
  primaryColor: string;
  secondaryColor?: string;
  opacity: number;
  hasGlassmorphism: boolean;
  industry?: string;
}

export interface GreetingTemplate {
  persona: VoicePersona;
  templates: string[];
  variables: {
    companyName: string;
    industry: string;
    tone: string;
    feature?: string;
  };
}

// Color palette analysis
function analyzeColorPalette(colors: string[]): {
  brightness: 'dark' | 'medium' | 'bright';
  saturation: 'muted' | 'vibrant' | 'neutral';
  temperature: 'warm' | 'cool' | 'neutral';
  formality: 'casual' | 'professional' | 'luxury';
} {
  const validColors = colors.filter(Boolean);
  const avgBrightness = validColors.reduce((sum, color) => {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return sum + brightness;
  }, 0) / validColors.length;

  const brightness = avgBrightness < 128 ? 'dark' : avgBrightness > 200 ? 'bright' : 'medium';
  
  // Simplified saturation and temperature analysis
  const hasWarmColors = validColors.some(c => 
    c.includes('#ff') || c.includes('#f') || c.includes('#e') || c.includes('#d')
  );
  const hasCoolColors = validColors.some(c => 
    c.includes('#00') || c.includes('#0') || c.includes('#1') || c.includes('#2') || c.includes('#3') || c.includes('#4') || c.includes('#5') || c.includes('#6') || c.includes('#7') || c.includes('#8') || c.includes('#9')
  );
  
  const temperature = hasWarmColors && hasCoolColors ? 'neutral' : hasWarmColors ? 'warm' : 'cool';
  
  // Determine formality based on color types
  const hasLuxuryColors = validColors.some(c => 
    c.includes('#d4') || c.includes('#b8') || c.includes('#f4') || c.includes('#e5')
  );
  const hasTechColors = validColors.some(c => 
    c.includes('#00') || c.includes('#0e') || c.includes('#1e') || c.includes('#08')
  );
  
  let formality: 'casual' | 'professional' | 'luxury' = 'professional';
  if (hasLuxuryColors) formality = 'luxury';
  else if (hasTechColors) formality = 'professional';
  else if (temperature === 'warm') formality = 'casual';
  
  return {
    brightness,
    saturation: 'vibrant', // Simplified
    temperature,
    formality
  };
}

// Map visual style to voice persona
export function mapVisualStyleToPersona(style: VisualStyle): VoicePersona {
  const colors = [style.primaryColor, style.secondaryColor].filter((c): c is string => Boolean(c));
  const colorAnalysis = analyzeColorPalette(colors);
  
  // Base persona on industry
  const basePersona: VoicePersona = {
    tone: 'professional',
    vocabulary: 'formal',
    pace: 'medium',
    energy: 'moderate'
  };

  // Adjust based on industry
  switch (style.industry?.toLowerCase()) {
    case 'finance':
    case 'healthcare':
      basePersona.tone = 'professional';
      basePersona.vocabulary = 'formal';
      basePersona.pace = 'slow';
      basePersona.energy = 'calm';
      break;
    case 'technology':
    case 'e-commerce':
      basePersona.tone = 'tech';
      basePersona.vocabulary = 'technical';
      basePersona.pace = 'medium';
      basePersona.energy = 'moderate';
      break;
    case 'real estate':
    case 'professional services':
      basePersona.tone = 'luxury';
      basePersona.vocabulary = 'inspiring';
      basePersona.pace = 'medium';
      basePersona.energy = 'moderate';
      break;
    default:
      basePersona.tone = 'friendly';
      basePersona.vocabulary = 'welcoming';
      basePersona.pace = 'medium';
      basePersona.energy = 'moderate';
  }

  // Adjust based on visual style
  if (style.headerType === 'gradient' && style.hasGlassmorphism) {
    basePersona.tone = 'tech';
    basePersona.vocabulary = 'technical';
    basePersona.energy = 'high';
  } else if (style.headerType === 'solid' && colorAnalysis.formality === 'luxury') {
    basePersona.tone = 'luxury';
    basePersona.vocabulary = 'inspiring';
    basePersona.pace = 'slow';
    basePersona.energy = 'calm';
  } else if (colorAnalysis.temperature === 'warm') {
    basePersona.tone = 'warm';
    basePersona.vocabulary = 'welcoming';
    basePersona.energy = 'moderate';
  }

  // Adjust based on opacity (transparency = modern/friendly)
  if (style.opacity < 0.7) {
    basePersona.pace = 'medium';
    basePersona.energy = 'high';
  } else if (style.opacity > 0.9) {
    basePersona.pace = 'slow';
    basePersona.energy = 'calm';
  }

  return basePersona;
}

// Generate greeting templates based on persona
export function generateGreetingTemplate(persona: VoicePersona, companyName: string, industry?: string): GreetingTemplate {
  const templates = getTemplatesForPersona(persona);
  
  return {
    persona,
    templates,
    variables: {
      companyName,
      industry: industry || 'business',
      tone: getToneDescription(persona.tone),
      feature: getFeaturedCapability(persona)
    }
  };
}

function getTemplatesForPersona(persona: VoicePersona): string[] {
  const { tone, vocabulary } = persona;
  
  const templateMatrix = {
    professional_formal: [
      "Welcome to {companyName}. I'm here to assist you with our professional {industry} solutions.",
      "Thank you for visiting {companyName}. How may I provide you with expert {industry} assistance today?",
      "Greetings from {companyName}. I'm your dedicated {industry} specialist, ready to help."
    ],
    friendly_casual: [
      "Hey there! Welcome to {companyName}. I'm excited to help you with our {industry} services!",
      "Hi! Thanks for stopping by {companyName}. What can I help you with today?",
      "Welcome to {companyName}! I'm here to make your {industry} experience amazing."
    ],
    tech_technical: [
      "Welcome to {companyName}. I'm your AI-powered {industry} assistant, optimized for your needs.",
      "Greetings. {companyName}'s intelligent {industry} platform is ready to assist you.",
      "Welcome to {companyName}. I'm equipped with advanced {industry} capabilities to help you."
    ],
    luxury_inspiring: [
      "Welcome to {companyName}. Experience the excellence of our premium {industry} services.",
      "Greetings from {companyName}. Allow me to guide you through our exceptional {industry} offerings.",
      "Welcome to {companyName}. Discover the sophistication of our world-class {industry} solutions."
    ],
    warm_welcoming: [
      "Welcome to {companyName}! It's wonderful to have you here. How can I make your {industry} journey delightful?",
      "Warm greetings from {companyName}! I'm here to ensure your {industry} experience is exceptional.",
      "Welcome to {companyName}! I'm delighted to assist you with our {industry} services."
    ],
    energetic_welcoming: [
      "Welcome to {companyName}! I'm thrilled to help you explore our amazing {industry} solutions!",
      "Excited to welcome you to {companyName}! Let's discover our incredible {industry} offerings together!",
      "Welcome to {companyName}! I'm pumped to show you our fantastic {industry} services!"
    ]
  };

  const key = `${tone}_${vocabulary}` as keyof typeof templateMatrix;
  return templateMatrix[key] || templateMatrix.professional_formal;
}

function getToneDescription(tone: VoicePersona['tone']): string {
  const descriptions = {
    professional: 'professional',
    friendly: 'friendly',
    energetic: 'energetic',
    luxury: 'luxurious',
    tech: 'innovative',
    warm: 'warm'
  };
  return descriptions[tone];
}

function getFeaturedCapability(persona: VoicePersona): string {
  const capabilities = {
    professional: 'expert assistance',
    friendly: 'helpful support',
    energetic: 'dynamic solutions',
    luxury: 'premium services',
    tech: 'advanced technology',
    warm: 'personalized care'
  };
  return capabilities[persona.tone];
}

// Generate final greeting text
export function generateFinalGreeting(template: GreetingTemplate): string {
  const selectedTemplate = template.templates[Math.floor(Math.random() * template.templates.length)];
  
  let greeting = selectedTemplate;
  
  // Replace variables
  Object.entries(template.variables).forEach(([key, value]) => {
    const placeholder = `{${key}}`;
    greeting = greeting.replace(new RegExp(placeholder, 'g'), value);
  });
  
  return greeting;
}

// Complete pipeline: Visual Style → Persona → Greeting
export function createHarmoniousGreeting(
  visualStyle: VisualStyle,
  companyName: string,
  industry?: string
): { persona: VoicePersona; greeting: string; explanation: string } {
  const persona = mapVisualStyleToPersona(visualStyle);
  const template = generateGreetingTemplate(persona, companyName, industry);
  const greeting = generateFinalGreeting(template);
  
  const explanation = generateExplanation(persona, visualStyle);
  
  return { persona, greeting, explanation };
}

function generateExplanation(persona: VoicePersona, style: VisualStyle): string {
  const toneWords = {
    professional: 'professional and trustworthy',
    friendly: 'approachable and warm',
    energetic: 'dynamic and engaging',
    luxury: 'sophisticated and premium',
    tech: 'innovative and modern',
    warm: 'welcoming and personal'
  };
  
  const styleWords = {
    solid: 'solid header conveys stability',
    gradient: 'gradient design suggests modern innovation',
    image: 'image background creates visual context'
  };
  
  return `I've designed a ${toneWords[persona.tone]} voice personality that complements the ${styleWords[style.headerType]} and ${style.opacity < 0.8 ? 'translucent glassmorphic effects' : 'bold visual presence'}. The tone matches your ${style.industry || 'business'} industry perfectly.`;
}
