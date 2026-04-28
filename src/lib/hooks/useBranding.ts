import { useEffect, useState } from 'react';

export interface BrandingOptions {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
}

export function useBranding(options?: BrandingOptions | null) {
  const [branding, setBranding] = useState<BrandingOptions | null>(null);

  useEffect(() => {
    if (options) {
      setBranding(options);
    }
  }, [options]);

  return { branding, setBranding };
}
