import { describe, it, expect } from 'vitest';
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

describe('createRouter', () => {
  it('creates a router', () => {
    const router = createRouter();
    expect(router).toBeDefined();
  });

  it('creates a simple GET handler', async () => {
    const router = createRouter();
    const handler = router.handler(async () => ({ message: 'hello' }));

    const res = await handler(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello' });
  });

  it('returns 201 for POST handlers', async () => {
    const router = createRouter();
    const handler = router.handler(async () => ({ id: '1' }));

    const res = await handler(makeReq('POST'));
    expect(res.status).toBe(201);
  });

  it('passes through raw Response from handler', async () => {
    const router = createRouter();
    const handler = router.handler(async () => {
      return new Response('custom', { status: 299 });
    });

    const res = await handler(makeReq());
    expect(res.status).toBe(299);
    expect(await res.text()).toBe('custom');
  });
});

describe('Router.use() middleware', () => {
  it('adds context via middleware', async () => {
    const router = createRouter()
      .use(async ({ next }) => next({ user: { id: '1', name: 'Alice' } }));

    const handler = router.handler(async ({ ctx }) => {
      return { user: (ctx as any).user };
    });

    const res = await handler(makeReq());
    expect(await res.json()).toEqual({ user: { id: '1', name: 'Alice' } });
  });

  it('chains multiple middleware', async () => {
    const router = createRouter()
      .use(async ({ next }) => next({ a: 1 }))
      .use(async ({ next }) => next({ b: 2 }));

    const handler = router.handler(async ({ ctx }) => {
      return { a: (ctx as any).a, b: (ctx as any).b };
    });

    const res = await handler(makeReq());
    expect(await res.json()).toEqual({ a: 1, b: 2 });
  });

  it('middleware can short-circuit with error', async () => {
    const router = createRouter()
      .use(async () => {
        throw new HttpError(401, 'Not authenticated');
      });

    const handler = router.handler(async () => ({ data: 'secret' }));
    const res = await handler(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('router is immutable — .use() returns new instance', () => {
    const base = createRouter();
    const extended = base.use(async ({ next }) => next({ added: true }));
    expect(base).not.toBe(extended);
    expect(base._middlewares).toHaveLength(0);
    expect(extended._middlewares).toHaveLength(1);
  });
});

describe('Router with custom error handler', () => {
  it('uses custom onError', async () => {
    const router = createRouter({
      onError: (err) => {
        return Response.json({ custom: true, msg: (err as Error).message }, { status: 418 });
      },
    });

    const handler = router.handler(async () => {
      throw new Error('oops');
    });

    const res = await handler(makeReq());
    expect(res.status).toBe(418);
    expect(await res.json()).toEqual({ custom: true, msg: 'oops' });
  });
});
