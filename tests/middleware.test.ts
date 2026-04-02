import { describe, it, expect, vi } from 'vitest';
import { runMiddlewareChain } from '../src/middleware.js';

function makeReq(method = 'GET', url = 'http://localhost/api') {
  return new Request(url, { method });
}

describe('runMiddlewareChain', () => {
  it('executes handler when no middleware', async () => {
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const res = await runMiddlewareChain([], makeReq(), {}, handler);
    expect(handler).toHaveBeenCalledOnce();
    expect(await res.json()).toEqual({ ok: true });
  });

  it('passes context through middleware chain', async () => {
    const mw1 = vi.fn(async ({ next }: any) => next({ user: 'alice' }));
    const mw2 = vi.fn(async ({ ctx, next }: any) => {
      expect(ctx.user).toBe('alice');
      return next({ role: 'admin' });
    });
    const handler = vi.fn(async (ctx: any) => {
      expect(ctx.user).toBe('alice');
      expect(ctx.role).toBe('admin');
      return Response.json({ ok: true });
    });

    await runMiddlewareChain([mw1, mw2], makeReq(), {}, handler);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('allows middleware to short-circuit', async () => {
    const mw = vi.fn(async () => Response.json({ error: 'blocked' }, { status: 403 }));
    const handler = vi.fn(async () => Response.json({ ok: true }));

    const res = await runMiddlewareChain([mw], makeReq(), {}, handler);
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
  });

  it('executes in onion order', async () => {
    const order: string[] = [];

    const mw1 = async ({ next }: any) => {
      order.push('mw1-before');
      const res = await next();
      order.push('mw1-after');
      return res;
    };
    const mw2 = async ({ next }: any) => {
      order.push('mw2-before');
      const res = await next();
      order.push('mw2-after');
      return res;
    };
    const handler = async () => {
      order.push('handler');
      return Response.json({ ok: true });
    };

    await runMiddlewareChain([mw1, mw2], makeReq(), {}, handler);
    expect(order).toEqual(['mw1-before', 'mw2-before', 'handler', 'mw2-after', 'mw1-after']);
  });

  it('propagates errors from middleware', async () => {
    const mw = async () => {
      throw new Error('middleware error');
    };
    const handler = vi.fn(async () => Response.json({ ok: true }));

    await expect(
      runMiddlewareChain([mw], makeReq(), {}, handler)
    ).rejects.toThrow('middleware error');
  });
});
