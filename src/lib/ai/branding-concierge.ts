import type { CanonicalBranding, LayerConfig } from '../schemas/tenant-config.canonical';

const DEFAULT_LAYER: LayerConfig = {
  type: 'solid',
  value: '#1A73E8',
  opacity: 1,
  backdropBlur: false,
};

export interface BrandingTheme {
  key: string;
  label: string;
  aliases: string[];
  branding: Partial<CanonicalBranding>;
}

export const THEMES: BrandingTheme[] = [
  {
    key: 'legal',
    label: 'Legal',
    aliases: ['legal', 'law firm', 'attorney', 'corporate legal', 'serious'],
    branding: {
      primaryColor: '#0A2540',
      accentColor: '#1A73E8',
      header: { ...DEFAULT_LAYER, value: '#0A2540' },
      footer: { ...DEFAULT_LAYER, value: '#0A2540', type: 'solid' },
      widgetBody: { ...DEFAULT_LAYER, value: '#FFFFFF', opacity: 0.95, backdropBlur: true },
    },
  },
  {
    key: 'modern',
    label: 'Modern',
    aliases: ['modern', 'clean', 'sleek', 'contemporary', 'minimalist'],
    branding: {
      primaryColor: '#0097b2',
      accentColor: '#00d4aa',
      header: { type: 'gradient', value: 'linear-gradient(135deg, #0097b2, #00d4aa)', opacity: 1, backdropBlur: false },
      footer: { type: 'solid', value: '#f8fafc', opacity: 1, backdropBlur: false },
      widgetBody: { ...DEFAULT_LAYER, value: '#FFFFFF', opacity: 0.92, backdropBlur: true },
    },
  },
  {
    key: 'bold',
    label: 'Bold',
    aliases: ['bold', 'vibrant', 'colorful', 'energetic', 'bright'],
    branding: {
      primaryColor: '#FF006E',
      accentColor: '#FFBE0B',
      header: { type: 'solid', value: '#FF006E', opacity: 1, backdropBlur: false },
      footer: { type: 'solid', value: '#FFBE0B', opacity: 1, backdropBlur: false },
      widgetBody: { ...DEFAULT_LAYER, value: '#FFF5F7', opacity: 0.95, backdropBlur: false },
    },
  },
  {
    key: 'elegant',
    label: 'Elegant',
    aliases: ['elegant', 'luxury', 'premium', 'sophisticated', 'refined'],
    branding: {
      primaryColor: '#1A1A2E',
      accentColor: '#C9A96E',
      header: { type: 'solid', value: '#1A1A2E', opacity: 1, backdropBlur: false },
      footer: { type: 'solid', value: '#16213E', opacity: 1, backdropBlur: false },
      widgetBody: { ...DEFAULT_LAYER, value: '#F8F5F0', opacity: 0.96, backdropBlur: true },
    },
  },
  {
    key: 'playful',
    label: 'Playful',
    aliases: ['playful', 'fun', 'friendly', 'casual', 'cheerful'],
    branding: {
      primaryColor: '#FF6B6B',
      accentColor: '#4ECDC4',
      header: { type: 'gradient', value: 'linear-gradient(135deg, #FF6B6B, #FFE66D)', opacity: 1, backdropBlur: false },
      footer: { type: 'solid', value: '#4ECDC4', opacity: 1, backdropBlur: false },
      widgetBody: { ...DEFAULT_LAYER, value: '#FFF9E6', opacity: 0.94, backdropBlur: false },
    },
  },
  {
    key: 'corporate',
    label: 'Corporate',
    aliases: ['corporate', 'business', 'professional', 'enterprise', 'formal'],
    branding: {
      primaryColor: '#003366',
      accentColor: '#0055A4',
      header: { type: 'solid', value: '#003366', opacity: 1, backdropBlur: false },
      footer: { type: 'solid', value: '#E8E8E8', opacity: 1, backdropBlur: false },
      widgetBody: { ...DEFAULT_LAYER, value: '#FFFFFF', opacity: 0.98, backdropBlur: false },
    },
  },
];

export function getBrandingTheme(input: string): BrandingTheme | undefined {
  const lower = input.toLowerCase();
  return THEMES.find((t) => t.aliases.some((a) => lower.includes(a)));
}

export function getBrandingThemeByKey(key: string): BrandingTheme | undefined {
  return THEMES.find((t) => t.key === key.toLowerCase());
}
