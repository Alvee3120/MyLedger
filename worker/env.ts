export interface Env {
  DB: D1Database
  /** HMAC key used to sign session tokens. Set via `wrangler pages secret put AUTH_SECRET`. */
  AUTH_SECRET: string
  /**
   * Comma-separated usernames allowed to reach `/api/admin/*`. Leave unset and
   * the owner account (the first one created, id 1) is the admin instead.
   */
  ADMIN_USERNAMES?: string
}

/**
 * Shared Hono environment. `userId` is written by `requireAuth` and read by
 * every data route — it is the single source of tenant scoping.
 */
export interface AppBindings {
  Bindings: Env
  Variables: {
    /** Id of the signed-in account. Always > 0 once the middleware has run. */
    userId: number
  }
}
