import { describe, it, expect } from 'vitest';
import { deepMerge } from './deep-merge';

describe('deepMerge', () => {
  describe('basic object merging', () => {
    it('should merge simple properties', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 3, c: 4 });
      expect(result).toBe(target); // Should return the same reference
    });

    it('should add new properties from source', () => {
      const target = { a: 1 };
      const source = { b: 2, c: 3 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('should handle empty source object', () => {
      const target = { a: 1, b: 2 };
      const source = {};
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should handle empty target object', () => {
      const target = {};
      const source = { a: 1, b: 2 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 2 });
    });
  });

  describe('nested object merging', () => {
    it('should recursively merge nested objects', () => {
      const target = {
        theme: { colors: { primary: '#000', secondary: '#fff' } },
      };
      const source = {
        theme: { colors: { primary: '#00f' } },
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        theme: { colors: { primary: '#00f', secondary: '#fff' } },
      });
    });

    it('should handle deep nesting at multiple levels', () => {
      const target = {
        level1: {
          level2: {
            level3: {
              value: 'original',
              preserved: 'keep-me',
            },
          },
        },
      };
      const source = {
        level1: {
          level2: {
            level3: {
              value: 'updated',
            },
          },
        },
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              value: 'updated',
              preserved: 'keep-me',
            },
          },
        },
      });
    });

    it('should add new nested properties', () => {
      const target = { config: { a: 1 } };
      const source = { config: { b: 2 } };
      const result = deepMerge(target, source);

      expect(result).toEqual({ config: { a: 1, b: 2 } });
    });

    it('should replace entire nested object when source value is not an object', () => {
      const target = { config: { a: 1, b: 2 } };
      const source = { config: 'string-value' };
      const result = deepMerge(target, source);

      expect(result).toEqual({ config: 'string-value' });
    });
  });

  describe('array handling', () => {
    it('should replace arrays by default', () => {
      const target = {
        integrations: { domains: ['a.com', 'b.com'] },
      };
      const source = {
        integrations: { domains: ['c.com'] },
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        integrations: { domains: ['c.com'] },
      });
    });

    it('should concatenate arrays when mergeArrays option is true', () => {
      const target = { items: [1, 2] };
      const source = { items: [3, 4] };
      const result = deepMerge(target, source, { mergeArrays: true });

      expect(result).toEqual({ items: [1, 2, 3, 4] });
    });

    it('should handle empty arrays in source', () => {
      const target = { items: [1, 2, 3] };
      const source = { items: [] };
      const result = deepMerge(target, source);

      expect(result).toEqual({ items: [] });
    });

    it('should handle empty arrays in target', () => {
      const target = { items: [] };
      const source = { items: [1, 2] };
      const result = deepMerge(target, source);

      expect(result).toEqual({ items: [1, 2] });
    });

    it('should replace target array with source array (no mergeArrays option)', () => {
      const target = { data: ['old1', 'old2', 'old3'] };
      const source = { data: ['new1'] };
      const result = deepMerge(target, source);

      expect(result).toEqual({ data: ['new1'] });
    });
  });

  describe('mixed object/array structures', () => {
    it('should handle complex nested structures with arrays and objects', () => {
      const target = {
        config: {
          theme: { colors: ['#000', '#fff'] },
          settings: { enabled: true },
        },
      };
      const source = {
        config: {
          theme: { colors: ['#f00'] },
          settings: { disabled: false },
        },
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        config: {
          theme: { colors: ['#f00'] },
          settings: { enabled: true, disabled: false },
        },
      });
    });

    it('should handle arrays containing objects', () => {
      const target = {
        items: [{ id: 1, name: 'item1' }],
      };
      const source = {
        items: [{ id: 2, name: 'item2' }],
      };
      const result = deepMerge(target, source);

      // Arrays should be replaced, not merged
      expect(result).toEqual({
        items: [{ id: 2, name: 'item2' }],
      });
    });
  });

  describe('null and undefined handling', () => {
    it('should allow null values to replace existing values', () => {
      const target = { a: 'value', b: 'value' };
      const source: Record<string, string | null> = { a: null };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: null, b: 'value' });
    });

    it('should allow undefined values to replace existing values', () => {
      const target = { a: 'value', b: 'value' };
      const source = { a: undefined };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: undefined, b: 'value' });
    });

    it('should handle nested null values', () => {
      const target = {
        config: { a: 'value', b: 'value' },
      };
      const source: Record<
        string,
        Record<string, string | null>
      > = {
        config: { a: null },
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        config: { a: null, b: 'value' },
      });
    });

    it('should not merge when source value is null', () => {
      const target = { config: { a: 1, b: 2 } };
      const source: Record<string, null> = { config: null };
      const result = deepMerge(target, source);

      expect(result).toEqual({ config: null });
    });
  });

  describe('type safety', () => {
    it('should preserve string values', () => {
      const target = { name: 'John' };
      const source = { name: 'Jane' };
      const result = deepMerge(target, source);

      expect(result.name).toBe('Jane');
      expect(typeof result.name).toBe('string');
    });

    it('should preserve number values', () => {
      const target = { count: 5 };
      const source = { count: 10 };
      const result = deepMerge(target, source);

      expect(result.count).toBe(10);
      expect(typeof result.count).toBe('number');
    });

    it('should preserve boolean values', () => {
      const target = { enabled: false };
      const source = { enabled: true };
      const result = deepMerge(target, source);

      expect(result.enabled).toBe(true);
      expect(typeof result.enabled).toBe('boolean');
    });

    it('should handle mixed types in nested structures', () => {
      const target = {
        config: {
          name: 'app',
          port: 3000,
          debug: false,
          tags: ['a', 'b'],
        },
      };
      const source = {
        config: {
          name: 'updated-app',
          port: 8000,
          tags: ['c'],
        },
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        config: {
          name: 'updated-app',
          port: 8000,
          debug: false,
          tags: ['c'],
        },
      });
    });
  });

  describe('edge cases', () => {
    it('should only merge own properties from source, not inherited ones', () => {
      const target = { a: 1 };

      // Create an object with a property on the prototype
      const proto = { inherited: 'from-prototype' };
      const source = Object.create(proto);
      (source as Record<string, string>).own = 'own-property';

      const result = deepMerge(target, source as Record<string, unknown>);

      // Should merge own properties but not inherited ones
      expect(result).toEqual({ a: 1, own: 'own-property' });
      expect('inherited' in result).toBe(false);
    });

    it('should not mutate source object', () => {
      const target = { a: { b: 1 } };
      const source = { a: { c: 2 } };
      const sourceClone = JSON.parse(JSON.stringify(source));

      deepMerge(target, source);

      expect(source).toEqual(sourceClone);
    });

    it('should handle source being a partial type', () => {
      interface Config {
        a: number;
        b: number;
        c: number;
      }

      const target: Config = { a: 1, b: 2, c: 3 };
      const source: Partial<Config> = { b: 20 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 20, c: 3 });
    });

    it('should return same reference (mutate target)', () => {
      const target = { a: 1 };
      const source = { b: 2 };
      const result = deepMerge(target, source);

      expect(result).toBe(target);
    });

    it('should handle very deep nesting', () => {
      const target = {
        l1: { l2: { l3: { l4: { l5: { value: 'original' } } } } },
      };
      const source = {
        l1: { l2: { l3: { l4: { l5: { value: 'updated' } } } } },
      };
      const result = deepMerge(target, source);

      expect(result.l1.l2.l3.l4.l5.value).toBe('updated');
    });

    it('should handle numeric string keys', () => {
      const target: Record<string, string> = { '0': 'first', '1': 'second' };
      const source: Record<string, string> = { '0': 'updated' };
      const result = deepMerge(target, source);

      expect(result).toEqual({ '0': 'updated', '1': 'second' });
    });

    it('should not treat Date objects as plain objects', () => {
      const target = { date: new Date('2024-01-01') };
      const source: Record<string, Date> = { date: new Date('2024-12-31') };
      const result = deepMerge(target, source as Record<string, unknown>);

      expect(result.date).toEqual(new Date('2024-12-31'));
      expect(result.date instanceof Date).toBe(true);
    });

    it('should handle regular expression objects', () => {
      const target = { pattern: /test/gi };
      const source = { pattern: /new/g };
      const result = deepMerge(target, source);

      expect(result.pattern).toEqual(/new/g);
    });
  });

  describe('real-world usage examples', () => {
    it('should merge tenant configuration updates', () => {
      const existingConfig = {
        theme: {
          colors: { primary: '#000', secondary: '#fff' },
          fonts: { body: 'Arial', heading: 'Times' },
        },
        integrations: {
          domains: ['a.com', 'b.com'],
          webhooks: { enabled: true },
        },
      };

      const update = {
        theme: { colors: { primary: '#00f' } },
        integrations: { domains: ['c.com'] },
      };

      const result = deepMerge(existingConfig, update);

      expect(result).toEqual({
        theme: {
          colors: { primary: '#00f', secondary: '#fff' },
          fonts: { body: 'Arial', heading: 'Times' },
        },
        integrations: {
          domains: ['c.com'],
          webhooks: { enabled: true },
        },
      });
    });

    it('should merge environment-specific settings', () => {
      const baseConfig = {
        database: { host: 'localhost', port: 5432, ssl: false },
        api: { timeout: 5000, retries: 3 },
      };

      const productionOverrides = {
        database: { host: 'prod.db.com', ssl: true },
        api: { timeout: 10000 },
      };

      const result = deepMerge(baseConfig, productionOverrides);

      expect(result).toEqual({
        database: { host: 'prod.db.com', port: 5432, ssl: true },
        api: { timeout: 10000, retries: 3 },
      });
    });
  });
});
