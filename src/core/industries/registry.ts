// Industry Configuration Registry
// Defines industry-specific features and super functions for scalable multi-industry support

export interface IndustryProfile {
  id: string;
  label: string;
  features: string[];
  superFunctions: string[];
}

export const INDUSTRY_PROFILES: Record<string, IndustryProfile> = {
  automotive: {
    id: 'automotive',
    label: 'Automotive Dealership',
    features: [
      'inventory_management',
      'vin_decoder',
      'test_drive_scheduler',
      'vehicle_inspection',
      'trade_in_estimator',
      'financing_calculator'
    ],
    superFunctions: [
      'lead_signal',
      'ai_omni_chat',
      'market_analytics',
      'competitor_pricing'
    ]
  },
  general: {
    id: 'general',
    label: 'General Business',
    features: [
      'contact_management',
      'lead_tracking',
      'appointment_scheduler',
      'document_management'
    ],
    superFunctions: [
      'lead_signal',
      'ai_omni_chat'
    ]
  }
};

export const INDUSTRY_OPTIONS = Object.values(INDUSTRY_PROFILES);

export function getIndustryProfile(industryId: string): IndustryProfile {
  return INDUSTRY_PROFILES[industryId] || INDUSTRY_PROFILES.general;
}

export function getIndustryFeatureLabel(featureId: string): string {
  const featureLabels: Record<string, string> = {
    inventory_management: 'Inventory Management',
    vin_decoder: 'VIN Decoder',
    test_drive_scheduler: 'Test Drive Scheduler',
    vehicle_inspection: 'Vehicle Inspection',
    trade_in_estimator: 'Trade-In Estimator',
    financing_calculator: 'Financing Calculator',
    contact_management: 'Contact Management',
    lead_tracking: 'Lead Tracking',
    appointment_scheduler: 'Appointment Scheduler',
    document_management: 'Document Management'
  };
  return featureLabels[featureId] || featureId;
}

export function getSuperFunctionLabel(functionId: string): string {
  const functionLabels: Record<string, string> = {
    lead_signal: 'Lead Signal AI',
    ai_omni_chat: 'AI Omni-Chat',
    market_analytics: 'Market Analytics',
    competitor_pricing: 'Competitor Pricing'
  };
  return functionLabels[functionId] || functionId;
}
