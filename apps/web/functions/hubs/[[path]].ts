import { proxyToApi, type Env } from '../_lib/proxy';

// Route /hubs/world, /hubs/world/negotiate, and WebSocket upgrade requests.
export const onRequest: PagesFunction<Env> = proxyToApi;
