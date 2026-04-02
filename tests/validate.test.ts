import { describe, it, expect } from 'vitest';
import { validateSchema } from '../src/validate.js';

/** Create a Standard Schema v1 mock */
function createStandardSchema(validateFn: (data: unknown) => any) {
  return {
    '~standard': {
      version: 1 as const,
      vendor: 'test',
      validate: validateFn,
    },
  };
}

/** Create a Zod-like legacy mock */
function createZodLikeMock(safeParseFn: (data: unknown) => any) {
  return { safeParse: safeParseFn };
}

describe('validateSchema', () => {
  describe('Standard Schema v1', () => {
    it('validates successfully with Standard Schema', async () => {
      const schema = createStandardSchema((data) => ({ value: data }));
      const result = await validateSchema(schema as any, { name: 'test' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toEqual({ name: 'test' });
    });

    it('returns issues on validation failure', async () => {
      const schema = createStandardSchema(() => ({
        issues: [{ message: 'Required', path: ['name'] }],
      }));
      const result = await validateSchema(schema as any, {});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].message).toBe('Required');
      }
    });

    it('supports async validation', async () => {
      const schema = createStandardSchema(async (data) => {
        await new Promise((r) => setTimeout(r, 1));
        return { value: data };
      });
      const result = await validateSchema(schema as any, { async: true });
      expect(result.success).toBe(true);
    });

    it('rejects Standard Schema v2 (version check)', async () => {
      const schema = {
        '~standard': {
          version: 2,
          vendor: 'test',
          validate: () => ({ value: {} }),
        },
      };
      await expect(validateSchema(schema as any, {})).rejects.toThrow(
        'Schema must implement Standard Schema v1'
      );
    });
  });

  describe('Zod 3.x legacy (.safeParse)', () => {
    it('validates successfully with safeParse', async () => {
      const schema = createZodLikeMock((data) => ({ success: true, data }));
      const result = await validateSchema(schema as any, { name: 'test' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toEqual({ name: 'test' });
    });

    it('returns issues on safeParse failure', async () => {
      const schema = createZodLikeMock(() => ({
        success: false,
        error: { issues: [{ message: 'Invalid', path: ['email'] }] },
      }));
      const result = await validateSchema(schema as any, {});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0].message).toBe('Invalid');
        expect(result.issues[0].path).toEqual(['email']);
      }
    });
  });

  describe('unsupported schema', () => {
    it('throws for plain object without schema interface', async () => {
      await expect(validateSchema({} as any, {})).rejects.toThrow(
        'Schema must implement Standard Schema v1'
      );
    });

    it('throws for null schema', async () => {
      await expect(validateSchema(null as any, {})).rejects.toThrow();
    });
  });
});
