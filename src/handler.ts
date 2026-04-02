import type {
  AnyContext,
  AnySchema,
  HandlerFn,
  InferOutput,
  InputOptions,
  InputSource,
  MiddlewareFn,
  NextRouteHandler,
  RouterConfig,
} from './types.js';
import { formatError, formatValidationError } from './errors.js';
import { validateSchema } from './validate.js';
import { parseBody, parseQuery, resolveParams } from './parse.js';
import { createResponse, isResponse } from './response.js';
import { runMiddlewareChain } from './middleware.js';

/**
 * RouteBuilder — per-endpoint chain with .input()/.params()/.output()/.handler()
 *
 * Type parameters accumulate through chaining:
 * - TCtx: context from middleware chain
 * - TInput: validated input type (body or query)
 * - TParams: validated route params type
 * - TOutput: validated output type
 */
export class RouteBuilder<
  TCtx extends AnyContext,
  TInput,
  TParams,
  TOutput
> {
  private middlewares: MiddlewareFn[];
  private config: RouterConfig;
  private inputSchema?: AnySchema<unknown>;
  private inputSource?: InputSource;
  private paramsSchema?: AnySchema<unknown>;
  private outputSchema?: AnySchema<unknown>;

  constructor(
    middlewares: MiddlewareFn[],
    config: RouterConfig,
    inputSchema?: AnySchema<unknown>,
    inputSource?: InputSource,
    paramsSchema?: AnySchema<unknown>,
    outputSchema?: AnySchema<unknown>
  ) {
    this.middlewares = middlewares;
    this.config = config;
    this.inputSchema = inputSchema;
    this.inputSource = inputSource;
    this.paramsSchema = paramsSchema;
    this.outputSchema = outputSchema;
  }

  /** Validate request body or query parameters */
  input<TSchema extends AnySchema<any>>(
    schema: TSchema,
    opts?: InputOptions
  ): RouteBuilder<TCtx, InferOutput<TSchema>, TParams, TOutput> {
    if (this.inputSchema) {
      throw new Error('next-safe-handler: .input() called twice. Each handler can only have one input schema.');
    }
    return new RouteBuilder(
      this.middlewares,
      this.config,
      schema,
      opts?.source,
      this.paramsSchema,
      this.outputSchema
    );
  }

  /** Validate route parameters (e.g., [id], [slug]) */
  params<TSchema extends AnySchema<any>>(
    schema: TSchema
  ): RouteBuilder<TCtx, TInput, InferOutput<TSchema>, TOutput> {
    if (this.paramsSchema) {
      throw new Error('next-safe-handler: .params() called twice. Each handler can only have one params schema.');
    }
    return new RouteBuilder(
      this.middlewares,
      this.config,
      this.inputSchema,
      this.inputSource,
      schema,
      this.outputSchema
    );
  }

  /** Validate handler output (API contract enforcement) */
  output<TSchema extends AnySchema<any>>(
    schema: TSchema
  ): RouteBuilder<TCtx, TInput, TParams, InferOutput<TSchema>> {
    if (this.outputSchema) {
      throw new Error('next-safe-handler: .output() called twice. Each handler can only have one output schema.');
    }
    return new RouteBuilder(
      this.middlewares,
      this.config,
      this.inputSchema,
      this.inputSource,
      this.paramsSchema,
      schema
    );
  }

  /** Terminal method — returns a Next.js-compatible route handler */
  handler(fn: HandlerFn<TInput, TParams, TCtx, TOutput>): NextRouteHandler {
    const {
      middlewares,
      config,
      inputSchema,
      inputSource,
      paramsSchema,
      outputSchema,
    } = this;

    return async (req: Request, context?: { params?: Record<string, string> | Promise<Record<string, string>> }) => {
      try {
        return await runMiddlewareChain(
          middlewares,
          req,
          {},
          async (ctx) => {
            // 1. Parse and validate route params
            let validatedParams: unknown = undefined;
            if (paramsSchema) {
              const rawParams = await resolveParams(context);
              const result = await validateSchema(paramsSchema, rawParams);
              if (!result.success) {
                return Response.json(formatValidationError(result.issues), { status: 400 });
              }
              validatedParams = result.data;
            } else {
              validatedParams = await resolveParams(context);
            }

            // 2. Parse and validate input (body or query)
            let validatedInput: unknown = undefined;
            if (inputSchema) {
              const source = inputSource ?? (
                req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE'
                  ? 'query'
                  : 'body'
              );

              const rawInput = source === 'query'
                ? parseQuery(req)
                : await parseBody(req);

              const result = await validateSchema(inputSchema, rawInput);
              if (!result.success) {
                return Response.json(formatValidationError(result.issues), { status: 400 });
              }
              validatedInput = result.data;
            }

            // 3. Execute handler
            const output = await fn({
              input: validatedInput as TInput,
              params: validatedParams as TParams,
              ctx: ctx as TCtx,
              req,
            });

            // 4. Validate output if schema provided
            if (outputSchema && !isResponse(output)) {
              const result = await validateSchema(outputSchema, output);
              if (!result.success) {
                console.error('next-safe-handler: Output validation failed', result.issues);
                return Response.json(
                  {
                    error: {
                      message: 'Internal server error',
                      code: 'INTERNAL_SERVER_ERROR',
                      status: 500,
                    },
                  },
                  { status: 500 }
                );
              }
            }

            // 5. Wrap in Response
            return createResponse(output, req);
          }
        );
      } catch (error) {
        if (config.onError) {
          try {
            return await config.onError(error, req);
          } catch (onErrorFail) {
            console.error('next-safe-handler: onError handler threw', onErrorFail);
            return Response.json({ error: { message: 'Internal server error', code: 'INTERNAL_SERVER_ERROR', status: 500 } }, { status: 500 });
          }
        }
        const { body, status } = formatError(error);
        return Response.json(body, { status });
      }
    };
  }
}
