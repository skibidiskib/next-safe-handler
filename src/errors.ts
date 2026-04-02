import type { ErrorResponse, StandardSchemaIssue } from './types.js';

/**
 * HTTP error with status code, message, and optional details.
 * Throw this from middleware or handlers to return a typed error response.
 */
export class HttpError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Array<{ path: string; message: string }>;

  constructor(
    status: number,
    message: string,
    code?: string,
    details?: Array<{ path: string; message: string }>
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code ?? httpStatusToCode(status);
    this.details = details;
  }
}

/** Map common HTTP status codes to error codes */
function httpStatusToCode(status: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 405: return 'METHOD_NOT_ALLOWED';
    case 409: return 'CONFLICT';
    case 422: return 'UNPROCESSABLE_ENTITY';
    case 429: return 'TOO_MANY_REQUESTS';
    default: return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR';
  }
}

/** Format a validation error into the standard error response shape */
export function formatValidationError(issues: ReadonlyArray<StandardSchemaIssue>): ErrorResponse {
  return {
    error: {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      status: 400,
      details: issues.map((issue) => ({
        path: issue.path ? issue.path.map(String).join('.') : '',
        message: issue.message,
      })),
    },
  };
}

/** Format any error into the standard error response shape */
export function formatError(err: unknown): { body: ErrorResponse; status: number } {
  if (err instanceof HttpError) {
    return {
      status: err.status,
      body: {
        error: {
          message: err.message,
          code: err.code,
          status: err.status,
          ...(err.details ? { details: err.details } : {}),
        },
      },
    };
  }

  if (err instanceof SyntaxError && err.message.includes('JSON')) {
    return {
      status: 400,
      body: {
        error: {
          message: 'Invalid JSON in request body',
          code: 'BAD_REQUEST',
          status: 400,
        },
      },
    };
  }

  // Always log unknown errors for debugging
  console.error('next-safe-handler: Unhandled error', err);

  // In development, include the error message for debugging
  if (process.env.NODE_ENV === 'development' && err instanceof Error) {
    return {
      status: 500,
      body: {
        error: {
          message: err.message,
          code: 'INTERNAL_SERVER_ERROR',
          status: 500,
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
        status: 500,
      },
    },
  };
}
