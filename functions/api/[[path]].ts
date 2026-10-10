import { handle } from 'hono/cloudflare-pages'
import { createApp } from '../../worker/app'

/**
 * Cloudflare Pages Function — the whole Hono API is mounted here and reached
 * via `/api/*`. Deploying the SPA and the API from the same Pages project keeps
 * them same-origin, which is what lets the session cookie stay a plain
 * `HttpOnly; SameSite=Lax` cookie instead of a third-party one.
 */
const app = createApp()

export const onRequest = handle(app)
