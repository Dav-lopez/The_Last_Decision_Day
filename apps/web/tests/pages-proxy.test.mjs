import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../functions/api/[[path]].ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { onRequest } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('proxies same-origin API requests to fixed HTTPS origin, preserving path and query', async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async request => {
    forwarded = request;
    return new Response('ok', { status: 200, headers: { 'set-cookie': '__Host-tld-session=abc; Secure; HttpOnly; Path=/' } });
  };
  try {
    const request = new Request('https://game.pages.dev/api/v1/health/ready?detail=1', {
      headers: { 'x-forwarded-host': 'attacker.test', 'x-forwarded-proto': 'http', 'forwarded': 'for=evil' },
    });
    const response = await onRequest({ request, env: { API_ORIGIN: 'https://api.example.com' } });
    assert.equal(forwarded.url, 'https://api.example.com/api/v1/health/ready?detail=1');
    assert.equal(forwarded.method, 'GET');
    assert.equal(forwarded.headers.has('x-forwarded-host'), false);
    assert.equal(forwarded.headers.has('x-forwarded-proto'), false);
    assert.equal(forwarded.headers.has('forwarded'), false);
    assert.match(response.headers.get('set-cookie'), /__Host-tld-session=abc/);
  } finally { globalThis.fetch = originalFetch; }
});

test('preserves POST body, CSRF token, and cookie without following upstream redirects', async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async request => {
    forwarded = request;
    return new Response(null, { status: 302, headers: { location: '/api/v1/auth/me' } });
  };
  try {
    const request = new Request('https://game.pages.dev/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: '__Host-tld-csrf=xyz', 'x-csrf-token': 'token' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });
    const response = await onRequest({ request, env: { API_ORIGIN: 'https://api.example.com' } });
    assert.equal(forwarded.method, 'POST');
    assert.equal(forwarded.redirect, 'manual');
    assert.equal(forwarded.headers.get('cookie'), '__Host-tld-csrf=xyz');
    assert.equal(forwarded.headers.get('x-csrf-token'), 'token');
    assert.equal(await forwarded.text(), JSON.stringify({ email: 'test@example.com' }));
    assert.equal(response.status, 302);
  } finally { globalThis.fetch = originalFetch; }
});

test('fails closed on missing, insecure, credential-bearing or path-based upstream', async () => {
  for (const origin of ['', 'http://api.example.com', 'https://user:pass@api.example.com', 'https://api.example.com/base', 'not a URL']) {
    const request = new Request('https://game.pages.dev/api/v1/health/live');
    const response = await onRequest({ request, env: { API_ORIGIN: origin } });
    assert.equal(response.status, 503, origin);
  }
});
