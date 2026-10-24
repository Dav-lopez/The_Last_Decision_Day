interface Env { API_ORIGIN: string; EDGE_PROXY_SECRET: string }
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.API_ORIGIN) return new Response('API origin is not configured', { status: 503 });
  let origin: URL;
  try {
    origin = new URL(env.API_ORIGIN);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
      throw new Error('Invalid origin');
  } catch {
    return new Response('Invalid API origin configuration', { status: 503 });
  }
  // Cloudflare sets CF-Connecting-IP at the edge. Never forward client-supplied
  // identity/secret headers; issue both trusted headers in the Pages Function.
  if (!env.EDGE_PROXY_SECRET || new TextEncoder().encode(env.EDGE_PROXY_SECRET).length < 32)
    return new Response('Edge proxy secret is not configured', { status: 503 });
  const clientIp = request.headers.get('cf-connecting-ip');
  if (!clientIp || clientIp.length > 64 || !/^[0-9a-fA-F:.]+$/.test(clientIp))
    return new Response('Cloudflare client address is unavailable', { status: 503 });
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, origin);
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('x-forwarded-host');
  headers.delete('x-forwarded-proto');
  headers.delete('forwarded');
  headers.delete('x-forwarded-for');
  headers.delete('cf-connecting-ip');
  headers.delete('x-tld-client-ip');
  headers.delete('x-tld-edge-secret');
  headers.set('x-tld-client-ip', clientIp);
  headers.set('x-tld-edge-secret', env.EDGE_PROXY_SECRET);
  // Restrict proxy to this fixed, operator-controlled upstream.
  return fetch(new Request(target.toString(), { method: request.method, headers, body: request.body, redirect: 'manual', duplex: 'half' } as RequestInit));
};
