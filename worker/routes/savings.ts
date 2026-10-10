import { Hono, type Context } from 'hono'
import type { SavingsBalances, SavingsMutationResult, SavingsState } from '@shared/types'
import type { AppBindings } from '../env'
import { round2, toISODate } from '../lib/util'
import { savingsEntrySchema } from '../lib/validation'

export const savingsRoutes = new Hono<AppBindings>()

const MAX_ITEMS = 200

const BALANCES_SQL =
  'SELECT current_balance, savings_balance, currency_symbol FROM settings WHERE user_id = ?'

interface BalanceRow {
  current_balance: number
  savings_balance: number
  currency_symbol: string
}

function toBalances(row: BalanceRow | null | undefined): SavingsBalances {
  return {
    current_balance: round2(row?.current_balance ?? 0),
    savings_balance: round2(row?.savings_balance ?? 0),
    currency_symbol: row?.currency_symbol ?? '৳',
  }
}

function readBalances(db: D1Database, userId: number): Promise<BalanceRow | null> {
  return db.prepare(BALANCES_SQL).bind(userId).first<BalanceRow>()
}

async function mutationResult(
  c: Context<AppBindings>,
  userId: number,
): Promise<SavingsMutationResult> {
  const balances = toBalances(await readBalances(c.env.DB, userId))
  return { ok: true, ...balances }
}

/** The savings page: both balances plus the most recent movements. */
savingsRoutes.get('/', async (c) => {
  const userId = c.get('userId')

  const [settings, entries] = await c.env.DB.batch([
    c.env.DB.prepare(BALANCES_SQL).bind(userId),
    c.env.DB.prepare(
      `SELECT id, kind, amount, note, date, created_at
         FROM savings_entries
        WHERE user_id = ?
        ORDER BY date DESC, id DESC
        LIMIT ?`,
    ).bind(userId, MAX_ITEMS),
  ])

  const payload: SavingsState = {
    ...toBalances((settings?.results?.[0] ?? null) as BalanceRow | null),
    items: (entries?.results ?? []) as SavingsState['items'],
  }
  return c.json(payload)
})

/** Move money from the current balance into savings. */
savingsRoutes.post('/deposit', async (c) => {
  const userId = c.get('userId')
  const parsed = savingsEntrySchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid amount' }, 400)
  }

  const current = await readBalances(c.env.DB, userId)
  if (!current) return c.json({ error: 'Settings row missing' }, 500)

  const amount = round2(parsed.data.amount)
  // The guard the whole feature is about: you can only save what you actually have.
  if (amount > current.current_balance) {
    return c.json(
      {
        error: `You can save up to ${current.currency_symbol}${round2(current.current_balance)}`,
      },
      400,
    )
  }

  await c.env.DB.prepare(
    `INSERT INTO savings_entries (user_id, kind, amount, note, date)
     VALUES (?1, 'deposit', ?2, ?3, ?4)`,
  )
    .bind(
      userId,
      amount,
      parsed.data.note?.trim() ? parsed.data.note.trim() : null,
      parsed.data.date ?? toISODate(new Date()),
    )
    .run()

  return c.json(await mutationResult(c, userId), 201)
})

/** Spend out of savings. The money leaves; the current balance is untouched. */
savingsRoutes.post('/spend', async (c) => {
  const userId = c.get('userId')
  const parsed = savingsEntrySchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid amount' }, 400)
  }

  const current = await readBalances(c.env.DB, userId)
  if (!current) return c.json({ error: 'Settings row missing' }, 500)

  const amount = round2(parsed.data.amount)
  if (amount > current.savings_balance) {
    return c.json(
      {
        error: `You only have ${current.currency_symbol}${round2(current.savings_balance)} in savings`,
      },
      400,
    )
  }

  await c.env.DB.prepare(
    `INSERT INTO savings_entries (user_id, kind, amount, note, date)
     VALUES (?1, 'spend', ?2, ?3, ?4)`,
  )
    .bind(
      userId,
      amount,
      parsed.data.note?.trim() ? parsed.data.note.trim() : null,
      parsed.data.date ?? toISODate(new Date()),
    )
    .run()

  return c.json(await mutationResult(c, userId), 201)
})

/** Undo a mistaken entry; the delete triggers restore both balances. */
savingsRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = Number.parseInt(c.req.param('id'), 10)
  if (!Number.isFinite(id) || id <= 0) return c.json({ error: 'Invalid id' }, 400)

  const result = await c.env.DB.prepare(
    'DELETE FROM savings_entries WHERE id = ? AND user_id = ?',
  )
    .bind(id, userId)
    .run()
  if (!result.meta.changes) return c.json({ error: 'Entry not found' }, 404)

  return c.json(await mutationResult(c, userId))
})
