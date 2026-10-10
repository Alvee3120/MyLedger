import { Hono } from 'hono'
import type { AppBindings } from './env'
import { requireAuth } from './lib/auth'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { budgetRoutes } from './routes/budgets'
import { categoryRoutes } from './routes/categories'
import { exportRoutes } from './routes/export'
import { reportRoutes } from './routes/reports'
import { savingsRoutes } from './routes/savings'
import { settingsRoutes } from './routes/settings'
import { transactionRoutes } from './routes/transactions'

/** The only endpoints reachable without a session cookie. */
const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/status',
  '/api/auth/signup',
  '/api/auth/login',
  '/api/auth/logout',
])

export function createApp() {
  const app = new Hono<AppBindings>().basePath('/api')

  app.onError((error, c) => {
    console.error('Unhandled error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  })

  app.notFound((c) => c.json({ error: `No route for ${c.req.method} ${c.req.path}` }, 404))

  app.use('*', async (c, next) => {
    if (!c.env.AUTH_SECRET) {
      return c.json(
        {
          error:
            'AUTH_SECRET is not set. Add it with `wrangler pages secret put AUTH_SECRET` (or a .dev.vars file locally).',
        },
        500,
      )
    }
    if (PUBLIC_PATHS.has(c.req.path)) return next()
    return requireAuth(c, next)
  })

  app.get('/health', (c) => c.json({ ok: true }))

  app.route('/auth', authRoutes)
  app.route('/transactions', transactionRoutes)
  app.route('/categories', categoryRoutes)
  app.route('/settings', settingsRoutes)
  app.route('/reports', reportRoutes)
  app.route('/budgets', budgetRoutes)
  app.route('/export', exportRoutes)
  app.route('/savings', savingsRoutes)
  app.route('/admin', adminRoutes)

  return app
}
