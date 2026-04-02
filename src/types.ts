/** Extensible context record, accumulated through middleware chain */
export type AnyContext = Record<string, unknown>;

/** Standard Schema v1 interface (Zod 3.24+, Zod 4, Valibot, ArkType) */
export interface StandardSchema<TInput = unknown, TOutput = TInput> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown
    ) => StandardSchemaResult<TOutput> | Promise<StandardSchemaResult<TOutput>>;
    readonly types?: {
      readonly input: TInput;
      readonly output: TOutput;
    };
  };
}

export type StandardSchemaResult<T> =
  | { readonly value: T; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaIssue>; readonly value?: undefined };

export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey>;
}

/** Zod 3.x legacy interface (.safeParse) */
export interface ZodLikeSchema<T = unknown> {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ message: string; path: Array<string | number> }> } };
}

/** Any supported schema: Standard Schema v1 or Zod 3.x legacy */
export type AnySchema<T = unknown> = StandardSchema<unknown, T> | ZodLikeSchema<T>;

/** Infer the output type from a schema */
export type InferOutput<T> =
  T extends StandardSchema<unknown, infer O> ? O :
  T extends ZodLikeSchema<infer O> ? O :
  never;

/** Input source for validation */
export type InputSource = 'body' | 'query';

/** Middleware function signature */
export type MiddlewareFn<TCtxIn extends AnyContext = AnyContext, TCtxOut extends AnyContext = AnyContext> = (opts: {
  req: Request;
  ctx: TCtxIn;
  next: <TNew extends AnyContext = Record<string, never>>(newCtx?: TNew) => Promise<Response>;
}) => Promise<Response> | Response;

/** Handler function signature */
export type HandlerFn<
  TInput = undefined,
  TParams = undefined,
  TCtx extends AnyContext = AnyContext,
  TOutput = unknown
> = (opts: {
  input: TInput;
  params: TParams;
  ctx: TCtx;
  req: Request;
}) => Promise<TOutput> | TOutput;

/** Configuration for createRouter() */
export interface RouterConfig {
  /** Custom error handler — override default error formatting */
  onError?: (error: unknown, req: Request) => Response | Promise<Response>;
}

/** Standardized error response shape */
export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    status: number;
    details?: Array<{ path: string; message: string }>;
  };
}

/** Input options for .input() */
export interface InputOptions {
  source?: InputSource;
}

/** Next.js App Router handler signature (works with 14, 15, 16) */
export type NextRouteHandler = (
  req: Request,
  context?: { params?: Record<string, string> | Promise<Record<string, string>> }
) => Promise<Response>;
