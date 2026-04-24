/**
 * Color Extractor Utility
 * Extracts brand colors from a website URL for zero-effort white-labeling
 * 
 * This utility will eventually:
 * 1. Fetch the website HTML
 * 2. Parse meta tags for theme-color
 * 3. Extract dominant colors from the logo
 * 4. Analyze CSS for brand colors
 * 
 * For now, it's a placeholder for the future implementation.
 */

export interface ExtractedColors {
  primary: string;
  secondary: string;
  accent: string;
}

export async function extractBrandColors(url: string): Promise<ExtractedColors> {
  // TODO: Implement actual color extraction
  // This will involve:
  // - Fetching the website HTML
  // - Parsing meta tags (theme-color, msapplication-TileColor)
  // - Extracting colors from favicon/logo
  // - Analyzing CSS variables and styles
  
  // Placeholder implementation
  return {
    primary: '#0097b2',
    secondary: '#020617',
    accent: '#d4af37',
  };
}

export function validateHexColor(hex: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex);
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}
