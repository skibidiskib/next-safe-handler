# next-safe-handler

Type-safe route handler builder for Next.js App Router. Composable middleware, validation, and automatic error handling — zero boilerplate.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Built by Claude Code](https://img.shields.io/badge/Built%20by-Claude%20Code-blueviolet?logo=anthropic&logoColor=white)](https://claude.ai/code)

## The Problem

Every Next.js App Router route handler requires the same 30-40 lines of boilerplate:

```typescript
// app/api/users/route.ts — WITHOUT next-safe-handler
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const user = await db.user.create({ data: parsed.data });
    return NextResponse.json({ user }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## The Solution

```typescript
// app/api/users/route.ts — WITH next-safe-handler
export const POST = adminRouter
  .input(z.object({ name: z.string().min(1), email: z.string().email() }))
  .handler(async ({ input, ctx }) => {
    const user = await db.user.create({ data: input });
    return { user };
  });
```

**8 lines instead of 30.** Full type safety. Automatic error handling. Composable auth.

## Install

```bash
npm install next-safe-handler
```

**Requirements:** Next.js 14+ and a schema library (Zod, Valibot, or ArkType).

## Quick Start

```typescript
// lib/api.ts
import { createRouter, HttpError } from 'next-safe-handler';

export const router = createRouter();
```

```typescript
// app/api/hello/route.ts
import { router } from '@/lib/api';

export const GET = router.handler(async () => {
  return { message: 'Hello, world!' };
});
```

That's it. The handler returns JSON with proper status codes and catches all errors automatically.

## Routers & Middleware

Routers are **composable and reusable**. Each `.use()` adds middleware and returns a new router:

```typescript
// lib/api.ts
import { createRouter, HttpError } from 'next-safe-handler';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';

// Base router
export const router = createRouter();

// Authenticated router — adds user to context
export const authedRouter = router.use(async ({ next }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new HttpError(401, 'Authentication required');
  return next({ user: session.user });
});

// Admin router — requires admin role
export const adminRouter = authedRouter.use(async ({ ctx, next }) => {
  if (ctx.user.role !== 'ADMIN') throw new HttpError(403, 'Admin access required');
  return next();
});
```

Use different routers for different access levels:

```typescript
// Public endpoint
export const GET = router.handler(async () => ({ status: 'ok' }));

// Authenticated endpoint  
export const GET = authedRouter.handler(async ({ ctx }) => ({ user: ctx.user }));

// Admin-only endpoint
export const GET = adminRouter.handler(async ({ ctx }) => ({ admin: ctx.user.name }));
```

### Middleware Features

Middleware uses the **onion pattern** — each middleware wraps the next:

```typescript
// Timing middleware
const timedRouter = router.use(async ({ req, next }) => {
  const start = Date.now();
  const response = await next();
  console.log(`${req.method} ${req.url} - ${Date.now() - start}ms`);
  return response;
});
```

**Context accumulates through the chain.** Each `next({ key: value })` merges into the context, and TypeScript tracks the types.

## Input Validation

Validate request body, query parameters, or route params with any schema library supporting [Standard Schema](https://standardschema.dev/) (Zod 3.24+, Valibot, ArkType):

### Body Validation (POST/PUT/PATCH)

```typescript
export const POST = authedRouter
  .input(z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }))
  .handler(async ({ input }) => {
    // input is typed as { name: string; email: string }
    const user = await db.user.create({ data: input });
    return { user };
  });
```

### Query Validation (GET)

```typescript
export const GET = router
  .input(z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    search: z.string().optional(),
  }))
  .handler(async ({ input }) => {
    // input.page is number (coerced from string)
    const users = await db.user.findMany({
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    });
    return { users, page: input.page };
  });
```

**Auto-detection:** GET/HEAD/DELETE reads from query params, POST/PUT/PATCH reads from body. Override with `{ source: 'query' }` or `{ source: 'body' }`.

### Route Params

```typescript
// app/api/users/[id]/route.ts
export const GET = authedRouter
  .params(z.object({ id: z.string().uuid() }))
  .handler(async ({ params }) => {
    const user = await db.user.findUnique({ where: { id: params.id } });
    if (!user) throw new HttpError(404, 'User not found');
    return { user };
  });
```

Works with both Next.js 14 (direct params) and Next.js 15+ (Promise params) automatically.

### Combining Input + Params

```typescript
// app/api/posts/[id]/route.ts
export const PUT = adminRouter
  .params(z.object({ id: z.string() }))
  .input(z.object({ title: z.string(), content: z.string() }))
  .handler(async ({ input, params, ctx }) => {
    const post = await db.post.update({
      where: { id: params.id },
      data: { ...input, updatedBy: ctx.user.id },
    });
    return { post };
  });
```

## Output Validation

Enforce API contracts by validating handler output:

```typescript
export const GET = router
  .output(z.object({
    users: z.array(z.object({ id: z.string(), name: z.string() })),
    total: z.number(),
  }))
  .handler(async () => {
    return { users: [...], total: 42 };
  });
```

## Error Handling

### Throwing Errors

Throw `HttpError` anywhere in middleware or handlers:

```typescript
import { HttpError } from 'next-safe-handler';

throw new HttpError(404, 'User not found');
throw new HttpError(403, 'Forbidden', 'INSUFFICIENT_PERMISSIONS');
throw new HttpError(422, 'Invalid', 'VALIDATION_ERROR', [
  { path: 'email', message: 'Already taken' },
]);
```

### Error Response Format

All errors follow a consistent shape:

```json
{
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "status": 400,
    "details": [
      { "path": "email", "message": "Invalid email" }
    ]
  }
}
```

| Error Type | Status | Code |
|------------|--------|------|
| Validation error | 400 | `VALIDATION_ERROR` |
| Malformed JSON | 400 | `BAD_REQUEST` |
| `HttpError(401)` | 401 | `UNAUTHORIZED` |
| `HttpError(403)` | 403 | `FORBIDDEN` |
| `HttpError(404)` | 404 | `NOT_FOUND` |
| Unknown error | 500 | `INTERNAL_SERVER_ERROR` |

**Security:** Unknown errors never leak messages in production.

### Custom Error Handler

```typescript
const router = createRouter({
  onError: (error, req) => {
    Sentry.captureException(error);
    return Response.json(
      { error: { message: 'Something went wrong' } },
      { status: 500 }
    );
  },
});
```

## Auth Integration Examples

### NextAuth / Auth.js

```typescript
export const authedRouter = router.use(async ({ next }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new HttpError(401, 'Not authenticated');
  return next({ user: session.user });
});
```

### Clerk

```typescript
import { auth } from '@clerk/nextjs/server';

export const authedRouter = router.use(async ({ next }) => {
  const { userId } = await auth();
  if (!userId) throw new HttpError(401, 'Not authenticated');
  return next({ userId });
});
```

### Custom JWT

```typescript
import { jwtVerify } from 'jose';

export const authedRouter = router.use(async ({ req, next }) => {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) throw new HttpError(401, 'Missing token');
  const { payload } = await jwtVerify(token, secret);
  return next({ user: payload });
});
```

## API Reference

### `createRouter(config?)`

Creates a new router instance.

```typescript
const router = createRouter({
  onError?: (error: unknown, req: Request) => Response | Promise<Response>;
});
```

### `router.use(middleware)`

Adds middleware. Returns a new (immutable) router.

### `router.input(schema, options?)`

Validates request body or query params. `options.source` can be `'body'` or `'query'`.

### `router.params(schema)`

Validates route parameters.

### `router.output(schema)`

Validates handler output (API contract enforcement).

### `router.handler(fn)`

Terminal method — returns a Next.js route handler function.

```typescript
router.handler(async ({ input, params, ctx, req }) => {
  return { data: '...' }; // Automatically wrapped in Response.json()
});
```

### `HttpError`

```typescript
new HttpError(status: number, message: string, code?: string, details?: unknown)
```

## Comparison

| Feature | Raw handlers | tRPC | next-safe-handler |
|---------|-------------|------|-------------------|
| REST-native | Yes | No (RPC) | Yes |
| Type-safe input | Manual | Yes | Yes |
| Type-safe output | No | Yes | Yes |
| Middleware chain | No | Yes | Yes |
| Auth composable | No | Yes | Yes |
| Error handling | Manual | Built-in | Built-in |
| Learning curve | Low | High | Low |
| Incremental adoption | N/A | Hard | Easy |

## Attribution

This project was entirely designed, researched, written, tested, and published by [Claude Code](https://claude.ai/code) (Anthropic's AI coding agent). From market research identifying the gap in the Next.js ecosystem, to API design, implementation, test suite, documentation, and build configuration -- every line was authored by Claude.

## License

MIT
