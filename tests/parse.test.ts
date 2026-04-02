import { describe, it, expect } from 'vitest';
import { parseBody, parseQuery, resolveParams } from '../src/parse.js';

describe('parseBody', () => {
  it('parses JSON body', async () => {
    const req = new Request('http://localhost/api', {
      method: 'POST',
      body: JSON.stringify({ name: 'test' }),
      headers: { 'content-type': 'application/json' },
    });
    const result = await parseBody(req);
    expect(result).toEqual({ name: 'test' });
  });

  it('returns undefined for empty body', async () => {
    const req = new Request('http://localhost/api', { method: 'POST' });
    const result = await parseBody(req);
    expect(result).toBeUndefined();
  });

  it('throws SyntaxError for invalid JSON', async () => {
    const req = new Request('http://localhost/api', {
      method: 'POST',
      body: 'not json',
    });
    await expect(parseBody(req)).rejects.toThrow(SyntaxError);
  });
});

describe('parseQuery', () => {
  it('parses simple query params', () => {
    const req = new Request('http://localhost/api?name=test&page=1');
    const result = parseQuery(req);
    expect(result).toEqual({ name: 'test', page: '1' });
  });

  it('handles array params', () => {
    const req = new Request('http://localhost/api?tag=a&tag=b&tag=c');
    const result = parseQuery(req);
    expect(result).toEqual({ tag: ['a', 'b', 'c'] });
  });

  it('returns empty object for no params', () => {
    const req = new Request('http://localhost/api');
    const result = parseQuery(req);
    expect(result).toEqual({});
  });
});

describe('resolveParams', () => {
  it('resolves direct params (Next.js 14)', async () => {
    const result = await resolveParams({ params: { id: '123' } });
    expect(result).toEqual({ id: '123' });
  });

  it('resolves Promise params (Next.js 15+)', async () => {
    const result = await resolveParams({
      params: Promise.resolve({ id: '456' }),
    });
    expect(result).toEqual({ id: '456' });
  });

  it('returns empty object for no context', async () => {
    const result = await resolveParams();
    expect(result).toEqual({});
  });

  it('returns empty object for no params', async () => {
    const result = await resolveParams({});
    expect(result).toEqual({});
  });
});
