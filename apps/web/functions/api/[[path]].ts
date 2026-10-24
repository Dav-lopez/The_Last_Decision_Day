import { proxyToApi, type Env } from '../_lib/proxy';

export const onRequest: PagesFunction<Env> = proxyToApi;
