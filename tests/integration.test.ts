import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createRouter, HttpError } from '../src/index.js';

function makeReq(method = 'GET', url = 'http://localhost/api', body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'content-type': 'application/json' };
  }
  return new Request(url, init);
}

describe('real-world: authenticated CRUD API', () => {
  // Simulate auth
  const getSession = vi.fn();

  const router = createRouter();

  const authedRouter = router.use(async ({ next }) => {
    const session = getSession();
    if (!session) throw new HttpError(401, 'Authentication required');
    return next({ user: session.user });
  });

  const adminRouter = authedRouter.use(async ({ ctx, next }) => {
    if ((ctx as any).user.role !== 'ADMIN') {
      throw new HttpError(403, 'Admin access required');
    }
    return next();
  });

  it('rejects unauthenticated requests', async () => {
    getSession.mockReturnValue(null);
    const handler = authedRouter.handler(async () => ({ data: 'secret' }));
    const res = await handler(makeReq());
    expect(res.status).toBe(401);
  });

  it('rejects non-admin users', async () => {
    getSession.mockReturnValue({ user: { id: '1', role: 'USER' } });
    const handler = adminRouter.handler(async () => ({ data: 'admin-only' }));
    const res = await handler(makeReq());
    expect(res.status).toBe(403);
  });

  it('allows admin users with validated input', async () => {
    getSession.mockReturnValue({ user: { id: '1', role: 'ADMIN', name: 'Alice' } });

    const handler = adminRouter
      .input(z.object({
        name: z.string().min(1),
        email: z.string().email(),
      }))
      .handler(async ({ input, ctx }) => ({
        created: { ...input, id: 'new-1' },
        createdBy: (ctx as any).user.name,
      }));

    const res = await handler(makeReq('POST', 'http://localhost/api', {
      name: 'Bob',
      email: 'bob@test.com',
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toEqual({ name: 'Bob', email: 'bob@test.com', id: 'new-1' });
    expect(body.createdBy).toBe('Alice');
  });

  it('validates input before reaching handler', async () => {
    getSession.mockReturnValue({ user: { id: '1', role: 'ADMIN' } });

    const handler = adminRouter
      .input(z.object({ email: z.string().email() }))
      .handler(async ({ input }) => input);

    const res = await handler(makeReq('POST', 'http://localhost/api', {
      email: 'invalid',
    }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('real-world: public API with query params', () => {
  it('handles paginated list endpoint', async () => {
    const router = createRouter();
    const handler = router
      .input(z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(20),
        search: z.string().optional(),
      }))
      .output(z.object({
        items: z.array(z.object({ id: z.string(), name: z.string() })),
        total: z.number(),
        page: z.number(),
      }))
      .handler(async ({ input }) => ({
        items: [{ id: '1', name: 'Item 1' }],
        total: 1,
        page: input.page,
      }));

    const res = await handler(makeReq('GET', 'http://localhost/api?page=2&limit=10'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(2);
    expect(body.items).toHaveLength(1);
  });
});

describe('real-world: timing middleware', () => {
  it('wraps response with timing info via onion pattern', async () => {
    const logs: string[] = [];

    const router = createRouter()
      .use(async ({ req, next }) => {
        const start = Date.now();
        const res = await next();
        logs.push(`${req.method} ${new URL(req.url).pathname} - ${Date.now() - start}ms`);
        return res;
      });

    const handler = router.handler(async () => ({ ok: true }));
    await handler(makeReq('GET', 'http://localhost/api/users'));

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/GET \/api\/users - \d+ms/);
  });
});

describe('real-world: router reuse across endpoints', () => {
  it('same router used for different handlers', async () => {
    const router = createRouter()
      .use(async ({ next }) => next({ tenant: 'acme' }));

    const listHandler = router.handler(async ({ ctx }) => ({
      tenant: (ctx as any).tenant,
      items: [],
    }));

    const createHandler = router
      .input(z.object({ name: z.string() }))
      .handler(async ({ input, ctx }) => ({
        tenant: (ctx as any).tenant,
        created: input,
      }));

    const listRes = await listHandler(makeReq());
    expect((await listRes.json()).tenant).toBe('acme');

    const createRes = await createHandler(
      makeReq('POST', 'http://localhost/api', { name: 'New' })
    );
    expect((await createRes.json()).tenant).toBe('acme');
  });
});
