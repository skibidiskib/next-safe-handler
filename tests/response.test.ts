import { describe, it, expect } from 'vitest';
import { createResponse, isResponse } from '../src/response.js';

function makeReq(method = 'GET') {
  return new Request('http://localhost/api', { method });
}

describe('isResponse', () => {
  it('detects native Response', () => {
    expect(isResponse(new Response('ok'))).toBe(true);
  });

  it('rejects plain objects', () => {
    expect(isResponse({ status: 200 })).toBe(false);
  });

  it('rejects null/undefined', () => {
    expect(isResponse(null)).toBe(false);
    expect(isResponse(undefined)).toBe(false);
  });

  it('rejects strings/numbers', () => {
    expect(isResponse('response')).toBe(false);
    expect(isResponse(200)).toBe(false);
  });

  it('detects duck-typed Response-like object', () => {
    const fake = {
      status: 200,
      headers: new Headers(),
      text: async () => 'ok',
      json: async () => ({}),
    };
    expect(isResponse(fake)).toBe(true);
  });
});

describe('createResponse', () => {
  it('wraps plain object as JSON with 200 for GET', () => {
    const res = createResponse({ ok: true }, makeReq('GET'));
    expect(res.status).toBe(200);
  });

  it('wraps plain object as JSON with 201 for POST', () => {
    const res = createResponse({ id: '1' }, makeReq('POST'));
    expect(res.status).toBe(201);
  });

  it('passes through native Response unchanged', () => {
    const original = new Response('custom', { status: 202 });
    const res = createResponse(original, makeReq());
    expect(res).toBe(original);
    expect(res.status).toBe(202);
  });

  it('uses explicit status when provided', () => {
    const res = createResponse({ ok: true }, makeReq(), 299);
    expect(res.status).toBe(299);
  });
});
