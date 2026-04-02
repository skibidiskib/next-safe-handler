import type { AnySchema, StandardSchema, StandardSchemaIssue, ZodLikeSchema } from './types.js';

export interface ValidationSuccess<T> {
  success: true;
  data: T;
}

export interface ValidationFailure {
  success: false;
  issues: ReadonlyArray<StandardSchemaIssue>;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/** Check if schema implements Standard Schema v1 */
function isStandardSchema(schema: unknown): schema is StandardSchema {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    '~standard' in schema &&
    typeof (schema as StandardSchema)['~standard']?.validate === 'function'
  );
}

/** Check if schema implements Zod 3.x .safeParse() */
function isZodLike(schema: unknown): schema is ZodLikeSchema {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    'safeParse' in schema &&
    typeof (schema as ZodLikeSchema).safeParse === 'function'
  );
}

/** Validate data against any supported schema */
export async function validateSchema<T>(
  schema: AnySchema<T>,
  data: unknown
): Promise<ValidationResult<T>> {
  if (isStandardSchema(schema)) {
    const result = await schema['~standard'].validate(data);
    if (result.issues) {
      return { success: false, issues: result.issues };
    }
    return { success: true, data: result.value as T };
  }

  if (isZodLike(schema)) {
    const result = schema.safeParse(data);
    if (!result.success) {
      const issues: StandardSchemaIssue[] = result.error.issues.map((i) => ({
        message: i.message,
        path: i.path,
      }));
      return { success: false, issues };
    }
    return { success: true, data: result.data as T };
  }

  throw new Error('next-safe-handler: Schema must implement Standard Schema v1 or have a .safeParse() method');
}
