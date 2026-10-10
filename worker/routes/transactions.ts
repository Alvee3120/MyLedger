import { Hono } from 'hono'
import type { AppBindings } from '../env'
import {
  TRANSACTION_SELECT,
  parseTransactionFilter,
  savingsFilter,
  transactionFilter,
} from '../lib/queries'
import { clampInt, round2, toISODate } from '../lib/util'
import { createTransactionSchema, updateTransactionSchema } from '../lib/validation'

export const transactionRoutes = new Hono<AppBindings>()

function readId(raw: string): number | null {
  const id = Number.parseInt(raw, 10)
  return Number.isFinite(id) && id > 0 ? id : null
}

/** Scoped by owner, so an id belonging to another account reads as "not found". */
async function findById(db: D1Database, id: number, userId: number) {
  return db
    .prepare(`${TRANSACTION_SELECT} WHERE t.id = ? AND t.user_id = ?`)
    .bind(id, userId)
    .first()
}

/**
 * Resolves a category's type, but only when that category belongs to this
 * account. A category owned by somebody else returns null, which callers report
 * as "Category not found" — one account can never file against another's.
 */
async function categoryTypeFor(
  db: D1Database,
  categoryId: number,
  userId: number,
): Promise<string | null> {
  const row = await db
    .prepare('SELECT type FROM categories WHERE id = ? AND user_id = ?')
    .bind(categoryId, userId)
    .first<{ type: string }>()
  return row?.type ?? null
}

// The History feed is a union of the two ledgers. Columns line up one-for-one so
// the rows can be ordered and paginated as a single list; savings rows borrow the
// transaction shape and are flagged with `source` + `savings_kind`.
const TRANSACTION_BRANCH = `
  SELECT 'transaction' AS source,
         t.id          AS id,
         t.type        AS type,
         t.amount      AS amount,
         t.category_id AS category_id,
         t.note        AS note,
         t.date        AS date,
         t.created_at  AS created_at,
         c.name        AS category_name,
         c.color       AS category_color,
         c.icon        AS category_icon,
         NULL          AS savings_kind
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
`

const SAVINGS_BRANCH = `
  SELECT 'savings' AS source,
         s.id AS id,
         CASE WHEN s.kind = 'spend' THEN 'expense' ELSE 'earning' END AS type,
         s.amount AS amount,
         0 AS category_id,
         s.note AS note,
         s.date AS date,
         s.created_at AS created_at,
         CASE WHEN s.kind = 'spend' THEN 'Savings spent' ELSE 'Moved to savings' END AS category_name,
         '#0ea5e9' AS category_color,
         '🏦' AS category_icon,
         s.kind AS savings_kind
    FROM savings_entries s
`

transactionRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const query = c.req.query()
  const limit = clampInt(query.limit, 1, 500, 100)
  const offset = clampInt(query.offset, 0, 10_000_000, 0)

  const input = parseTransactionFilter(query, userId)
  const txFilter = transactionFilter(input)

  const branches = [`${TRANSACTION_BRANCH} ${txFilter.sql}`]
  const params: (string | number)[] = [...txFilter.params]

  // Savings rows have no category and are neither an expense nor an earning, so
  // they only join the feed while the user is browsing without those filters.
  if (!input.category_id && !input.type) {
    const sFilter = savingsFilter(input)
    branches.push(`${SAVINGS_BRANCH} ${sFilter.sql}`)
    params.push(...sFilter.params)
  }

  const union = branches.join('\nUNION ALL\n')

  const [countResult, rowsResult] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM (${union})`).bind(...params),
    c.env.DB.prepare(
      `SELECT * FROM (${union}) AS u ORDER BY u.date DESC, u.id DESC LIMIT ? OFFSET ?`,
    ).bind(...params, limit, offset),
  ])

  const total = (countResult?.results?.[0] as { total: number } | undefined)?.total ?? 0

  return c.json({
    items: rowsResult?.results ?? [],
    total,
    limit,
    offset,
  })
})

transactionRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  const parsed = createTransactionSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'Invalid transaction', issues: parsed.error.issues }, 400)
  }

  const input = parsed.data
  const type = await categoryTypeFor(c.env.DB, input.category_id, userId)
  if (!type) return c.json({ error: 'Category not found' }, 400)
  if (type !== input.type) {
    return c.json({ error: `That category is only available for ${type}s` }, 400)
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO transactions (user_id, type, amount, category_id, note, date)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(
      userId,
      input.type,
      round2(input.amount),
      input.category_id,
      input.note?.trim() ? input.note.trim() : null,
      input.date ?? toISODate(new Date()),
    )
    .run()

  const created = await findById(c.env.DB, result.meta.last_row_id as number, userId)
  return c.json(created, 201)
})

transactionRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const id = readId(c.req.param('id'))
  if (!id) return c.json({ error: 'Invalid id' }, 400)

  const existing = await c.env.DB.prepare(
    'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
  )
    .bind(id, userId)
    .first<{ type: string; amount: number; category_id: number; note: string | null; date: string }>()
  if (!existing) return c.json({ error: 'Transaction not found' }, 404)

  const parsed = updateTransactionSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'Invalid transaction', issues: parsed.error.issues }, 400)
  }

  const patch = parsed.data
  const nextType = patch.type ?? (existing.type as 'expense' | 'earning')
  const nextCategoryId = patch.category_id ?? existing.category_id

  const type = await categoryTypeFor(c.env.DB, nextCategoryId, userId)
  if (!type) return c.json({ error: 'Category not found' }, 400)
  if (type !== nextType) {
    return c.json({ error: `That category is only available for ${type}s` }, 400)
  }

  // user_id is deliberately not updatable: it is the ownership fence.
  await c.env.DB.prepare(
    `UPDATE transactions
        SET type = ?, amount = ?, category_id = ?, note = ?, date = ?
      WHERE id = ? AND user_id = ?`,
  )
    .bind(
      nextType,
      round2(patch.amount ?? existing.amount),
      nextCategoryId,
      patch.note === undefined ? existing.note : patch.note?.trim() || null,
      patch.date ?? existing.date,
      id,
      userId,
    )
    .run()

  const updated = await findById(c.env.DB, id, userId)
  return c.json(updated)
})

transactionRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = readId(c.req.param('id'))
  if (!id) return c.json({ error: 'Invalid id' }, 400)

  const result = await c.env.DB.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run()
  if (!result.meta.changes) return c.json({ error: 'Transaction not found' }, 404)

  const settings = await c.env.DB.prepare(
    'SELECT current_balance, currency_symbol FROM settings WHERE user_id = ?',
  )
    .bind(userId)
    .first()

  return c.json({ ok: true, ...settings })
})
