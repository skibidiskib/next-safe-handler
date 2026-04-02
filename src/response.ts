/** Check if a value is a Response (works across realms/polyfills) */
function isResponse(data: unknown): data is Response {
  if (data instanceof Response) return true;
  if (typeof data !== 'object' || data === null) return false;
  const r = data as Record<string, unknown>;
  return typeof r.status === 'number' && typeof r.headers === 'object' && typeof r.text === 'function' && typeof r.json === 'function';
}

/** Wrap a handler return value into a Response */
export function createResponse(data: unknown, req: Request, status?: number): Response {
  // If handler returned a raw Response, pass through
  if (isResponse(data)) {
    return data;
  }

  // Default status: 201 for POST, 200 for everything else
  const defaultStatus = req.method === 'POST' ? 201 : 200;
  const finalStatus = status ?? defaultStatus;

  return Response.json(data, { status: finalStatus });
}
