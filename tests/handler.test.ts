import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createRouter } from '../src/router.js';
import { HttpError } from '../src/errors.js';

function makeReq(method = 'GET', url = 'http://localhost/api', body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'content-type': 'application/json' };
  }
  return new Request(url, init);
}

describe('input validation', () => {
  it('validates POST body with Zod', async () => {
    const router = createRouter();
    const handler = router
      .input(z.object({ name: z.string(), email: z.string().email() }))
      .handler(async ({ input }) => ({ received: input }));

    const res = await handler(makeReq('POST', 'http://localhost/api', {
      name: 'Alice',
      email: 'alice@test.com',
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.received).toEqual({ name: 'Alice', email: 'alice@test.com' });
  });

  it('returns 400 for invalid body', async () => {
    const router = createRouter();
    const handler = router
      .input(z.object({ name: z.string(), email: z.string().email() }))
      .handler(async ({ input }) => ({ received: input }));

    const res = await handler(makeReq('POST', 'http://localhost/api', {
      name: 'Alice',
      email: 'not-an-email',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toHaveLength(1);
    expect(body.error.details[0].path).toBe('email');
  });

  it('validates GET query params', async () => {
    const router = createRouter();
    const handler = router
      .input(z.object({ page: z.coerce.number(), limit: z.coerce.number() }))
      .handler(async ({ input }) => ({ received: input }));

    const res = await handler(makeReq('GET', 'http://localhost/api?page=2&limit=10'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.received).toEqual({ page: 2, limit: 10 });
  });

  it('auto-detects source: query for GET, body for POST', async () => {
    const schema = z.object({ q: z.string() });
    const router = createRouter();

    // GET -> query
    const getHandler = router.input(schema).handler(async ({ input }) => input);
    const getRes = await getHandler(makeReq('GET', 'http://localhost/api?q=test'));
    expect(await getRes.json()).toEqual({ q: 'test' });

    // POST -> body
    const postHandler = router.input(schema).handler(async ({ input }) => input);
    const postRes = await postHandler(makeReq('POST', 'http://localhost/api', { q: 'test' }));
    expect(await postRes.json()).toEqual({ q: 'test' });
  });

  it('allows explicit source override', async () => {
    const router = createRouter();
    const handler = router
      .input(z.object({ q: z.string() }), { source: 'query' })
      .handler(async ({ input }) => input);

    // Force query even on POST
    const res = await handler(makeReq('POST', 'http://localhost/api?q=fromquery'));
    expect(await res.json()).toEqual({ q: 'fromquery' });
  });

  it('returns 400 for malformed JSON body', async () => {
    const router = createRouter();
    const handler = router
      .input(z.object({ name: z.string() }))
      .handler(async ({ input }) => input);

    const req = new Request('http://localhost/api', {
      method: 'POST',
      body: 'not json {{{',
      headers: { 'content-type': 'application/json' },
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('BAD_REQUEST');
  });
});

describe('params validation', () => {
  it('validates route params', async () => {
    const router = createRouter();
    const handler = router
      .params(z.object({ id: z.string().min(1) }))
      .handler(async ({ params }) => ({ id: params.id }));

    const res = await handler(makeReq(), { params: { id: 'abc123' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'abc123' });
  });

  it('validates Promise params (Next.js 15+)', async () => {
    const router = createRouter();
    const handler = router
      .params(z.object({ id: z.string() }))
      .handler(async ({ params }) => ({ id: params.id }));

    const res = await handler(makeReq(), { params: Promise.resolve({ id: 'xyz' }) });
    expect(await res.json()).toEqual({ id: 'xyz' });
  });

  it('returns 400 for invalid params', async () => {
    const router = createRouter();
    const handler = router
      .params(z.object({ id: z.string().uuid() }))
      .handler(async ({ params }) => ({ id: params.id }));

    const res = await handler(makeReq(), { params: { id: 'not-a-uuid' } });
    expect(res.status).toBe(400);
  });
});

describe('output validation', () => {
  it('passes valid output through', async () => {
    const router = createRouter();
    const handler = router
      .output(z.object({ id: z.string(), name: z.string() }))
      .handler(async () => ({ id: '1', name: 'Test' }));

    const res = await handler(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '1', name: 'Test' });
  });

  it('returns 500 for invalid output', async () => {
    const router = createRouter();
    const handler = router
      .output(z.object({ id: z.string(), name: z.string() }))
      .handler(async () => ({ id: 123, wrong: true }) as any);

    const res = await handler(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('combined input + params + middleware', () => {
  it('works with full chain', async () => {
    const router = createRouter()
      .use(async ({ next }) => next({ userId: 'user-1' }));

    const handler = router
      .params(z.object({ id: z.string() }))
      .input(z.object({ title: z.string() }))
      .handler(async ({ input, params, ctx }) => ({
        updatedBy: (ctx as any).userId,
        postId: params.id,
        title: input.title,
      }));

    const res = await handler(
      makeReq('PUT', 'http://localhost/api', { title: 'Updated' }),
      { params: { id: 'post-123' } }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      updatedBy: 'user-1',
      postId: 'post-123',
      title: 'Updated',
    });
  });
});

describe('error handling in handlers', () => {
  it('catches HttpError thrown in handler', async () => {
    const router = createRouter();
    const handler = router.handler(async () => {
      throw new HttpError(404, 'Post not found');
    });

    const res = await handler(makeReq());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: {
        message: 'Post not found',
        code: 'NOT_FOUND',
        status: 404,
      },
    });
  });
});
