/**
 * Tenant Configuration Service Tests
 *
 * Tests for adaptPayload and computeDelta functions that normalize heterogeneous
 * frontend payloads and compute configuration deltas for audit logging.
 */

import { describe, it, expect } from 'vitest';
import { adaptPayload, computeDelta } from './tenant-config.service';

describe('tenant-config.service', () => {
  describe('adaptPayload', () => {
    it('adapts ClientBrandingStudio payload with branding and features', () => {
      const payload = {
        tenantId: '123e4567-e89b-12d3-a456-426614174000',
        branding: {
          primaryColor: '#1A73E8',
          accentColor: '#34A853',
          logoUrl: 'https://example.com/logo.png',
        },
        features: {
          aiInsightBadge: true,
          aiDesignMirror: false,
        },
      };

      const result = adaptPayload(payload);

      expect(result).toEqual({
        branding: {
          primaryColor: '#1A73E8',
          accentColor: '#34A853',
          logoUrl: 'https://example.com/logo.png',
        },
        features: {
          aiInsightBadge: true,
          aiDesignMirror: false,
        },
      });
    });

    it('adapts useAICommand payload with configPatch', () => {
      const payload = {
        tenantId: '123e4567-e89b-12d3-a456-426614174000',
        configPatch: {
          theme: {
            colors: {
              primary: '#1A73E8',
              secondary: '#34A853',
            },
          },
          features: {
            customCss: true,
          },
        },
      };

      const result = adaptPayload(payload);

      expect(result).toEqual({
        theme: {
          colors: {
            primary: '#1A73E8',
            secondary: '#34A853',
          },
        },
        features: {
          customCss: true,
        },
      });
    });

    it('handles payload with branding only', () => {
      const payload = {
        tenantId: '123e4567-e89b-12d3-a456-426614174000',
        branding: {
          primaryColor: '#FF5733',
        },
      };

      const result = adaptPayload(payload);

      expect(result).toEqual({
        branding: {
          primaryColor: '#FF5733',
        },
      });
    });

    it('handles payload with features only', () => {
      const payload = {
        tenantId: '123e4567-e89b-12d3-a456-426614174000',
        features: {
          aiInsightBadge: true,
        },
      };

      const result = adaptPayload(payload);

      expect(result).toEqual({
        features: {
          aiInsightBadge: true,
        },
      });
    });

    it('returns empty object for non-object payload', () => {
      const result1 = adaptPayload(null);
      const result2 = adaptPayload(undefined);
      const result3 = adaptPayload('not an object');

      expect(result1).toEqual({});
      expect(result2).toEqual({});
      expect(result3).toEqual({});
    });

    it('ignores tenantId in fallback mode', () => {
      const payload = {
        tenantId: '123e4567-e89b-12d3-a456-426614174000',
        theme: { colors: { primary: '#FF0000' } },
      };

      const result = adaptPayload(payload);

      expect(result).toEqual({
        theme: { colors: { primary: '#FF0000' } },
      });
      expect(result).not.toHaveProperty('tenantId');
    });

    it('prioritizes branding/features over configPatch', () => {
      const payload = {
        tenantId: '123e4567-e89b-12d3-a456-426614174000',
        branding: { primaryColor: '#FF0000' },
        configPatch: { theme: { colors: { primary: '#0000FF' } } },
      };

      // ClientBrandingStudio format takes priority
      const result = adaptPayload(payload);

      expect(result).toEqual({
        branding: { primaryColor: '#FF0000' },
      });
      expect(result).not.toHaveProperty('configPatch');
    });
  });

  describe('computeDelta', () => {
    it('detects additions to config', () => {
      const oldConfig = {
        branding: { primaryColor: '#FF0000' },
      };

      const newConfig = {
        branding: { primaryColor: '#FF0000' },
        features: { aiInsightBadge: true },
      };

      const delta = computeDelta(oldConfig, newConfig);

      expect(delta).toEqual({
        features: {
          from: undefined,
          to: { aiInsightBadge: true },
        },
      });
    });

    it('detects modifications to existing properties', () => {
      const oldConfig = {
        branding: { primaryColor: '#FF0000' },
      };

      const newConfig = {
        branding: { primaryColor: '#0000FF' },
      };

      const delta = computeDelta(oldConfig, newConfig);

      expect(delta).toEqual({
        branding: {
          from: { primaryColor: '#FF0000' },
          to: { primaryColor: '#0000FF' },
        },
      });
    });

    it('detects deletions from config', () => {
      const oldConfig = {
        branding: { primaryColor: '#FF0000' },
        features: { aiInsightBadge: true },
      };

      const newConfig = {
        branding: { primaryColor: '#FF0000' },
      };

      const delta = computeDelta(oldConfig, newConfig);

      expect(delta).toEqual({
        features: {
          from: { aiInsightBadge: true },
          to: undefined,
        },
      });
    });

    it('returns null when there are no changes', () => {
      const config = {
        branding: { primaryColor: '#FF0000' },
        features: { aiInsightBadge: true },
      };

      const delta = computeDelta(config, config);

      expect(delta).toBeNull();
    });

    it('detects nested object changes', () => {
      const oldConfig = {
        theme: {
          colors: {
            primary: '#FF0000',
            secondary: '#00FF00',
          },
        },
      };

      const newConfig = {
        theme: {
          colors: {
            primary: '#FF0000',
            secondary: '#0000FF',
          },
        },
      };

      const delta = computeDelta(oldConfig, newConfig);

      expect(delta).toEqual({
        theme: {
          from: {
            colors: {
              primary: '#FF0000',
              secondary: '#00FF00',
            },
          },
          to: {
            colors: {
              primary: '#FF0000',
              secondary: '#0000FF',
            },
          },
        },
      });
    });

    it('detects array changes', () => {
      const oldConfig = {
        integrations: {
          domains: ['example.com', 'www.example.com'],
        },
      };

      const newConfig = {
        integrations: {
          domains: ['example.com'],
        },
      };

      const delta = computeDelta(oldConfig, newConfig);

      expect(delta).toEqual({
        integrations: {
          from: {
            domains: ['example.com', 'www.example.com'],
          },
          to: {
            domains: ['example.com'],
          },
        },
      });
    });

    it('handles undefined old config values', () => {
      const oldConfig = {};

      const newConfig = {
        branding: { primaryColor: '#FF0000' },
        features: { aiInsightBadge: true },
      };

      const delta = computeDelta(oldConfig, newConfig);

      expect(delta).toEqual({
        branding: {
          from: undefined,
          to: { primaryColor: '#FF0000' },
        },
        features: {
          from: undefined,
          to: { aiInsightBadge: true },
        },
      });
    });

    it('handles null values in config', () => {
      const oldConfig = {
        branding: null,
      };

      const newConfig = {
        branding: { primaryColor: '#FF0000' },
      };

      const delta = computeDelta(oldConfig as Record<string, unknown>, newConfig);

      expect(delta).toEqual({
        branding: {
          from: null,
          to: { primaryColor: '#FF0000' },
        },
      });
    });
  });
});
