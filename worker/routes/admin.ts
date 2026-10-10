import { Hono } from 'hono'
import type { AdminOverview, AdminUserRow } from '@shared/types'
import type { AppBindings } from '../env'
import { requireAdmin } from '../lib/auth'

export const adminRoutes = new Hono<AppBindings>()

// Every admin endpoint is owner-only; the allowlist decides who that is.
adminRoutes.use('*', requireAdmin)

const TOTALS_SQL = `
  SELECT
    COUNT(*) AS total_users,
    COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-7 days')  THEN 1 END), 0) AS new_users_7d,
    COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 END), 0) AS new_users_30d
    FROM users
`

/** "Active" means the account actually logged a transaction in the window. */
const ACTIVE_SQL = `
  SELECT COUNT(DISTINCT user_id) AS active_users_7d
    FROM transactions
   WHERE created_at >= datetime('now', '-7 days')
`

const USERS_SQL = `
  SELECT u.id,
         u.username,
         u.created_at,
         COUNT(t.id)       AS transaction_count,
         MAX(t.created_at) AS last_activity
    FROM users u
    LEFT JOIN transactions t ON t.user_id = u.id
   GROUP BY u.id
   ORDER BY u.created_at DESC, u.id DESC
`

interface TotalsRow {
  total_users: number
  new_users_7d: number
  new_users_30d: number
}

adminRoutes.get('/overview', async (c) => {
  const [totalsResult, activeResult, usersResult] = await c.env.DB.batch([
    c.env.DB.prepare(TOTALS_SQL),
    c.env.DB.prepare(ACTIVE_SQL),
    c.env.DB.prepare(USERS_SQL),
  ])

  const totals = (totalsResult?.results?.[0] ?? {}) as TotalsRow
  const active = (activeResult?.results?.[0] ?? {}) as { active_users_7d: number }
  const users = (usersResult?.results ?? []) as unknown as AdminUserRow[]

  const payload: AdminOverview = {
    total_users: totals.total_users ?? 0,
    new_users_7d: totals.new_users_7d ?? 0,
    new_users_30d: totals.new_users_30d ?? 0,
    active_users_7d: active.active_users_7d ?? 0,
    users,
  }
  return c.json(payload)
})
