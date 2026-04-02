import type { AnyContext, MiddlewareFn } from './types.js';

/**
 * Execute middleware chain in onion pattern.
 * Each middleware can add to context via next({ key: value }).
 * Short-circuit by returning a Response or throwing HttpError.
 */
export async function runMiddlewareChain(
  middlewares: MiddlewareFn[],
  req: Request,
  initialCtx: AnyContext,
  finalHandler: (ctx: AnyContext) => Promise<Response>
): Promise<Response> {
  let index = 0;

  async function dispatch(ctx: AnyContext): Promise<Response> {
    if (index >= middlewares.length) {
      return finalHandler(ctx);
    }

    const middleware = middlewares[index++];
    let called = false;
    return middleware({
      req,
      ctx,
      next: async (newCtx = {} as AnyContext) => {
        if (called) {
          throw new Error('next-safe-handler: next() called multiple times in middleware. Each middleware must call next() at most once.');
        }
        called = true;
        return dispatch({ ...ctx, ...newCtx });
      },
    });
  }

  return dispatch(initialCtx);
}
