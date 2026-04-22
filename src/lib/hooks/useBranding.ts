"use client";

import { useEffect } from "react";

export interface BrandingData {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  [key: string]: string | undefined;
}

export function useBranding(branding: BrandingData | null) {
  useEffect(() => {
    if (!branding) return;

    const root = document.documentElement;

    // Map database colors to CSS variables
    if (branding.primaryColor) {
      root.style.setProperty("--primary-gold", branding.primaryColor);
    }
    if (branding.secondaryColor) {
      root.style.setProperty("--deep-blue", branding.secondaryColor);
    }
    if (branding.backgroundColor) {
      root.style.setProperty("--background", branding.backgroundColor);
    }
    if (branding.foregroundColor) {
      root.style.setProperty("--foreground", branding.foregroundColor);
    }

    // Allow for any additional custom branding properties
    Object.entries(branding).forEach(([key, value]) => {
      if (
        value &&
        ![
          "primaryColor",
          "secondaryColor",
          "backgroundColor",
          "foregroundColor",
        ].includes(key)
      ) {
        root.style.setProperty(`--${key}`, value);
      }
    });
  }, [branding]);
}
