/** Parse JSON body from request, with error handling */
export async function parseBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text) return undefined;
  return JSON.parse(text); // SyntaxError will be caught by error handler
}

/** Parse query parameters from request URL into a plain object */
export function parseQuery(req: Request): Record<string, unknown> {
  const url = new URL(req.url);
  const result: Record<string, unknown> = {};

  for (const key of url.searchParams.keys()) {
    const values = url.searchParams.getAll(key);
    result[key] = values.length === 1 ? values[0] : values;
  }

  return result;
}

/**
 * Resolve route params — handles both Next.js 14 (direct object)
 * and Next.js 15+ (Promise<object>)
 */
export async function resolveParams(
  context?: { params?: Record<string, string> | Promise<Record<string, string>> }
): Promise<Record<string, string>> {
  if (!context?.params) return {};
  const params = context.params;
  if (typeof (params as Promise<unknown>).then === 'function') {
    return await (params as Promise<Record<string, string>>);
  }
  return params as Record<string, string>;
}
