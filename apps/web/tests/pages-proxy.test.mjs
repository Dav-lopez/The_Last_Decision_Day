import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Compile the shared proxy and both route entrypoints without depending on a
// deployed Cloudflare environment. The Pages bundling CI step checks routing.
const transpile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const proxySource = readFileSync(new URL('../functions/_lib/proxy.ts', import.meta.url), 'utf8');
const proxyUrl = moduleUrl(transpile(proxySource));
async function loadRoute(path) {
  const routeSource = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = transpile(routeSource);
  const linked = compiled.replace(/from ['"]\\.\\.\\/_lib\\/proxy['"]/, `from '${proxyUrl}'`);
  assert.notEqual(linked, compiled, `route ${path} must import the shared secured proxy`);
  return (await import(moduleUrl(linked))).onRequest;
}
const onRequest = await loadRoute('../functions/api/[[path]].ts');
const onHubRequest = await loadRoute('../functions/hubs/[[path]].ts');
const edgeEnv = { API_ORIGIN: 'https://api.example.com', EDGE_PROXY_SECRET: 's'.repeat(48) };

test('proxies same-origin API requests to fixed HTTPS origin, preserving path and query', async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async request => {
    forwarded = request;
    return new Response('ok', { status: 200, headers: { 'set-cookie': '__Host-tld-session=abc; Secure; HttpOnly; Path=/' } });
  };
  try {
    const request = new Request('https://game.pages.dev/api/v1/health/ready?detail=1', {
      headers: { 'x-forwarded-host': 'attacker.test', 'x-forwarded-proto': 'http', 'forwarded': 'for=evil',
        'x-forwarded-for': '198.51.100.99', 'x-tld-client-ip': '198.51.100.99',
        'x-tld-edge-secret': 'forged', 'cf-connecting-ip': '203.0.113.17' },
    });
    const response = await onRequest({ request, env: edgeEnv });
    assert.equal(forwarded.url, 'https://api.example.com/api/v1/health/ready?detail=1');
    assert.equal(forwarded.method, 'GET');
    assert.equal(forwarded.headers.has('x-forwarded-host'), false);
    assert.equal(forwarded.headers.has('x-forwarded-proto'), false);
    assert.equal(forwarded.headers.has('forwarded'), false);
    assert.equal(forwarded.headers.has('x-forwarded-for'), false);
    assert.equal(forwarded.headers.has('cf-connecting-ip'), false);
    assert.equal(forwarded.headers.get('x-tld-client-ip'), '203.0.113.17');
    assert.equal(forwarded.headers.get('x-tld-edge-secret'), edgeEnv.EDGE_PROXY_SECRET);
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
      headers: { 'content-type': 'application/json', cookie: '__Host-tld-csrf=xyz', 'x-csrf-token': 'token',
        'cf-connecting-ip': '2001:db8::2' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });
    const response = await onRequest({ request, env: edgeEnv });
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


test('fails closed without a strong edge secret or a Cloudflare client address', async () => {
  const request = new Request('https://game.pages.dev/api/v1/health/live');
  const missingIp = await onRequest({ request, env: edgeEnv });
  assert.equal(missingIp.status, 503);
  const weakSecret = await onRequest({ request: new Request(request.url, {
    headers: { 'cf-connecting-ip': '203.0.113.17' },
  }), env: { ...edgeEnv, EDGE_PROXY_SECRET: 'weak' } });
  assert.equal(weakSecret.status, 503);
  const invalidIp = await onRequest({ request: new Request(request.url, {
    headers: { 'cf-connecting-ip': '203.0.113.17, 198.51.100.1' },
  }), env: edgeEnv });
  assert.equal(invalidIp.status, 503);
});

test('SignalR negotiate and WebSocket upgrades share the authenticated edge proxy', async () => {
  const originalFetch = globalThis.fetch;
  const forwarded = [];
  globalThis.fetch = async request => {
    forwarded.push(request);
    // Node's Response does not model a 101 WebSocket handshake; this test
    // verifies upstream forwarding, not an established WebSocket connection.
    return new Response('forwarded');
  };
  try {
    const negotiate = new Request('https://game.pages.dev/hubs/world/negotiate?negotiateVersion=1', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.24', cookie: '__Host-tld-session=abc',
        'x-tld-edge-secret': 'spoofed', 'x-tld-client-ip': '198.51.100.1' },
    });
    assert.equal((await onHubRequest({ request: negotiate, env: edgeEnv })).status, 200);
    assert.equal(forwarded[0].url, 'https://api.example.com/hubs/world/negotiate?negotiateVersion=1');
    assert.equal(forwarded[0].method, 'POST');
    assert.equal(forwarded[0].headers.get('cookie'), '__Host-tld-session=abc');
    assert.equal(forwarded[0].headers.get('x-tld-client-ip'), '203.0.113.24');
    assert.equal(forwarded[0].headers.get('x-tld-edge-secret'), edgeEnv.EDGE_PROXY_SECRET);

    const upgrade = new Request('https://game.pages.dev/hubs/world?id=connection-1', {
      headers: { upgrade: 'websocket', connection: 'Upgrade',
        'cf-connecting-ip': '2001:db8::3', cookie: '__Host-tld-session=abc' },
    });
    assert.equal((await onHubRequest({ request: upgrade, env: edgeEnv })).status, 200);
    assert.equal(forwarded[1].url, 'https://api.example.com/hubs/world?id=connection-1');
    assert.equal(forwarded[1].headers.get('upgrade'), 'websocket');
    assert.equal(forwarded[1].headers.get('cookie'), '__Host-tld-session=abc');
    assert.equal(forwarded[1].headers.get('x-tld-client-ip'), '2001:db8::3');

    const noEdgeIp = await onHubRequest({
      request: new Request('https://game.pages.dev/hubs/world'),
      env: edgeEnv,
    });
    assert.equal(noEdgeIp.status, 503);
    assert.equal(forwarded.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});
