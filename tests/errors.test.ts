import { describe, it, expect } from 'vitest';
import { HttpError, formatError, formatValidationError } from '../src/errors.js';

describe('HttpError', () => {
  it('creates error with status and message', () => {
    const err = new HttpError(404, 'Not found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('HttpError');
  });

  it('allows custom error code', () => {
    const err = new HttpError(400, 'Bad request', 'CUSTOM_CODE');
    expect(err.code).toBe('CUSTOM_CODE');
  });

  it('allows typed details array', () => {
    const details = [{ path: 'email', message: 'Already taken' }];
    const err = new HttpError(422, 'Invalid', 'INVALID', details);
    expect(err.details).toEqual(details);
  });

  it('derives code from status', () => {
    expect(new HttpError(401, 'x').code).toBe('UNAUTHORIZED');
    expect(new HttpError(403, 'x').code).toBe('FORBIDDEN');
    expect(new HttpError(409, 'x').code).toBe('CONFLICT');
    expect(new HttpError(429, 'x').code).toBe('TOO_MANY_REQUESTS');
    expect(new HttpError(500, 'x').code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('formatError', () => {
  it('formats HttpError', () => {
    const err = new HttpError(403, 'Forbidden');
    const { body, status } = formatError(err);
    expect(status).toBe(403);
    expect(body.error.message).toBe('Forbidden');
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('formats JSON SyntaxError', () => {
    const err = new SyntaxError('Unexpected token in JSON');
    const { body, status } = formatError(err);
    expect(status).toBe(400);
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('sanitizes unknown errors in production', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const err = new Error('secret database error');
    const { body, status } = formatError(err);
    expect(status).toBe(500);
    expect(body.error.message).toBe('Internal server error');
    expect(body.error.message).not.toContain('secret');
    process.env.NODE_ENV = origEnv;
  });

  it('shows error details in development', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const err = new Error('debug info');
    const { body } = formatError(err);
    expect(body.error.message).toBe('debug info');
    process.env.NODE_ENV = origEnv;
  });

  it('formats non-Error values (string throw)', () => {
    const { body, status } = formatError('string error');
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('formats non-Error values (null throw)', () => {
    const { body, status } = formatError(null);
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('includes HttpError details in response', () => {
    const details = [{ path: 'email', message: 'Taken' }];
    const err = new HttpError(400, 'Validation', 'BAD', details);
    const { body } = formatError(err);
    expect(body.error.details).toEqual(details);
  });

  it('omits details when HttpError has none', () => {
    const err = new HttpError(404, 'Not found');
    const { body } = formatError(err);
    expect(body.error.details).toBeUndefined();
  });
});

describe('formatValidationError', () => {
  it('formats validation issues', () => {
    const result = formatValidationError([
      { message: 'Required', path: ['name'] },
      { message: 'Invalid email', path: ['email'] },
    ]);
    expect(result.error.status).toBe(400);
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(result.error.details).toHaveLength(2);
    expect(result.error.details![0]).toEqual({ path: 'name', message: 'Required' });
    expect(result.error.details![1]).toEqual({ path: 'email', message: 'Invalid email' });
  });
});
