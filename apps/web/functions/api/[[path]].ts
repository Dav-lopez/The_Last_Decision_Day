interface Env { API_ORIGIN: string }
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
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, origin);
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('x-forwarded-host');
  headers.delete('x-forwarded-proto');
  headers.delete('forwarded');
  // Restrict proxy to this fixed, operator-controlled upstream.
  return fetch(new Request(target.toString(), { method: request.method, headers, body: request.body, redirect: 'manual', duplex: 'half' } as RequestInit));
};
