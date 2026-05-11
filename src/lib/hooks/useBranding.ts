import { useState } from 'react';

export interface BrandingOptions {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
}

export function useBranding(options?: BrandingOptions | null) {
  const [branding] = useState<BrandingOptions | null>(options ?? null);

  return { branding };
}
