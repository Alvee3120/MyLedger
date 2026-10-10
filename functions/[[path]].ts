import type { Env as ApiEnv } from '../worker/env'

interface PagesEnv extends ApiEnv {
  ASSETS: Fetcher
}

/**
 * SPA fallback for every non-`/api` path.
 *
 * `/api/*` is owned by the more specific `functions/api/[[path]].ts`, so only
 * the client-side routes land here. Real files (hashed JS/CSS, icons, the
 * manifest, the service worker) are returned untouched; anything else is
 * rewritten to `index.html` so a hard refresh on `/reports` still boots the app.
 *
 * Doing this in a Function rather than a `_redirects` rule keeps the routing
 * unambiguous, since Pages evaluates Functions and `_redirects` in a fixed
 * internal order that would otherwise decide whether the API is reachable.
 */
export const onRequest: PagesFunction<PagesEnv> = async (context) => {
  const { request, env } = context
  const response = await env.ASSETS.fetch(request)

  if (response.status !== 404) return response
  if (request.method !== 'GET' && request.method !== 'HEAD') return response

  const url = new URL(request.url)
  url.pathname = '/index.html'
  return env.ASSETS.fetch(new Request(url.toString(), request))
}
