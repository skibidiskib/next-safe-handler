import type {
  AnyContext,
  AnySchema,
  HandlerFn,
  InferOutput,
  InputOptions,
  MiddlewareFn,
  NextRouteHandler,
  RouterConfig,
} from './types.js';
import { RouteBuilder } from './handler.js';
import { formatError } from './errors.js';
import { runMiddlewareChain } from './middleware.js';
import { createResponse } from './response.js';
import { resolveParams } from './parse.js';

/**
 * Router — reusable middleware chain.
 *
 * Immutable: each .use() returns a NEW Router with the middleware appended.
 * Share routers across route files for consistent auth/logging/etc.
 *
 * @example
 * ```typescript
 * const router = createRouter();
 * const authedRouter = router.use(authMiddleware);
 * const adminRouter = authedRouter.use(adminMiddleware);
 *
 * // In route.ts:
 * export const GET = adminRouter.handler(async ({ ctx }) => {
 *   return { users: await db.user.findMany() };
 * });
 * ```
 */
export class Router<TCtx extends AnyContext> {
  /** @internal */
  readonly _middlewares: MiddlewareFn[];
  /** @internal */
  readonly _config: RouterConfig;

  constructor(middlewares: MiddlewareFn[] = [], config: RouterConfig = {}) {
    this._middlewares = middlewares;
    this._config = config;
  }

  /** Add middleware that can extend context, short-circuit, or wrap responses */
  use<TNewCtx extends AnyContext>(
    fn: MiddlewareFn<TCtx, TCtx & TNewCtx>
  ): Router<TCtx & TNewCtx> {
    return new Router<TCtx & TNewCtx>(
      [...this._middlewares, fn as MiddlewareFn],
      this._config
    );
  }

  /** Start building a handler with input validation */
  input<TSchema extends AnySchema<any>>(
    schema: TSchema,
    opts?: InputOptions
  ): RouteBuilder<TCtx, InferOutput<TSchema>, undefined, unknown> {
    return new RouteBuilder<TCtx, InferOutput<TSchema>, undefined, unknown>(
      this._middlewares,
      this._config,
      schema,
      opts?.source
    );
  }

  /** Start building a handler with params validation */
  params<TSchema extends AnySchema<any>>(
    schema: TSchema
  ): RouteBuilder<TCtx, undefined, InferOutput<TSchema>, unknown> {
    return new RouteBuilder<TCtx, undefined, InferOutput<TSchema>, unknown>(
      this._middlewares,
      this._config,
      undefined,
      undefined,
      schema
    );
  }

  /** Start building a handler with output validation */
  output<TSchema extends AnySchema<any>>(
    schema: TSchema
  ): RouteBuilder<TCtx, undefined, undefined, InferOutput<TSchema>> {
    return new RouteBuilder<TCtx, undefined, undefined, InferOutput<TSchema>>(
      this._middlewares,
      this._config,
      undefined,
      undefined,
      undefined,
      schema
    );
  }

  /** Create a handler directly (no input/output validation) */
  handler<TOutput>(fn: HandlerFn<undefined, undefined, TCtx, TOutput>): NextRouteHandler {
    const { _middlewares: middlewares, _config: config } = this;

    return async (req: Request, context?: { params?: Record<string, string> | Promise<Record<string, string>> }) => {
      try {
        return await runMiddlewareChain(
          middlewares,
          req,
          {},
          async (ctx) => {
            const params = await resolveParams(context);
            const output = await fn({
              input: undefined as undefined,
              params: undefined as undefined,
              ctx: ctx as TCtx,
              req,
            });
            return createResponse(output, req);
          }
        );
      } catch (error) {
        if (config.onError) {
          return config.onError(error, req);
        }
        const { body, status } = formatError(error);
        return Response.json(body, { status });
      }
    };
  }
}

/** Create a new router instance */
export function createRouter(config?: RouterConfig): Router<Record<string, never>> {
  return new Router<Record<string, never>>([], config);
}
