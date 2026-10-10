import { Hono } from 'hono'
import type { AppBindings } from '../env'
import { hashPassword } from '../lib/auth'
import { round2 } from '../lib/util'
import { passwordSchema, updateSettingsSchema } from '../lib/validation'

export const settingsRoutes = new Hono<AppBindings>()

const PUBLIC_SETTINGS = `
  SELECT id, opening_balance, current_balance, savings_balance, currency_symbol, updated_at
    FROM settings WHERE user_id = ?
`

/** Net of this account's transactions only. */
const NET_EXPRESSION = (param: string) => `
  COALESCE((
    SELECT SUM(CASE WHEN type = 'earning' THEN amount ELSE -amount END)
      FROM transactions WHERE user_id = ${param}
  ), 0)
`

/** Everything ever moved into savings — money the current balance no longer holds. */
const DEPOSITS_EXPRESSION = (param: string) => `
  COALESCE((
    SELECT SUM(amount) FROM savings_entries
     WHERE user_id = ${param} AND kind = 'deposit'
  ), 0)
`

/** What the pot should hold: deposits in, spends out. */
const SAVINGS_EXPRESSION = (param: string) => `
  COALESCE((
    SELECT SUM(CASE WHEN kind = 'deposit' THEN amount ELSE -amount END)
      FROM savings_entries WHERE user_id = ${param}
  ), 0)
`

settingsRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const row = await c.env.DB.prepare(PUBLIC_SETTINGS).bind(userId).first()
  return c.json(row)
})

settingsRoutes.patch('/', async (c) => {
  const userId = c.get('userId')
  const parsed = updateSettingsSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid settings' }, 400)
  if (parsed.data.opening_balance === undefined && parsed.data.currency_symbol === undefined) {
    return c.json({ error: 'Nothing to update' }, 400)
  }

  const current = await c.env.DB.prepare('SELECT * FROM settings WHERE user_id = ?')
    .bind(userId)
    .first<{ opening_balance: number; currency_symbol: string }>()
  if (!current) return c.json({ error: 'Settings row missing' }, 500)

  const opening = round2(parsed.data.opening_balance ?? current.opening_balance)
  const symbol = parsed.data.currency_symbol ?? current.currency_symbol

  // Changing the opening balance invalidates the cached balance, so it is
  // rebuilt from scratch in the same statement. Savings deposits are subtracted
  // too — that money left the current balance for the pot.
  await c.env.DB.prepare(
    `UPDATE settings
        SET opening_balance = ?1,
            currency_symbol = ?2,
            current_balance = ROUND(?1 + ${NET_EXPRESSION('?3')} - ${DEPOSITS_EXPRESSION('?3')}, 2),
            updated_at = datetime('now')
      WHERE user_id = ?3`,
  )
    .bind(opening, symbol, userId)
    .run()

  const row = await c.env.DB.prepare(PUBLIC_SETTINGS).bind(userId).first()
  return c.json(row)
})

/** Repair valve: rebuild the cached balance from this account's transaction log. */
settingsRoutes.post('/recalculate', async (c) => {
  const userId = c.get('userId')

  await c.env.DB.prepare(
    `UPDATE settings
        SET current_balance = ROUND(opening_balance + ${NET_EXPRESSION('?1')} - ${DEPOSITS_EXPRESSION('?1')}, 2),
            savings_balance = ROUND(${SAVINGS_EXPRESSION('?1')}, 2),
            updated_at = datetime('now')
      WHERE user_id = ?1`,
  )
    .bind(userId)
    .run()

  const row = await c.env.DB.prepare(PUBLIC_SETTINGS).bind(userId).first()
  return c.json(row)
})

settingsRoutes.put('/password', async (c) => {
  const userId = c.get('userId')
  const parsed = passwordSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid password' }, 400)
  }

  const record = await hashPassword(parsed.data.password)
  await c.env.DB.prepare(
    `UPDATE users
        SET password_hash = ?, password_salt = ?, password_iterations = ?,
            failed_attempts = 0, locked_until = NULL
      WHERE id = ?`,
  )
    .bind(record.hash, record.salt, record.iterations, userId)
    .run()

  return c.json({ ok: true })
})
