import { Hono } from 'hono'
import type { AppBindings } from '../env'
import { createCategorySchema, updateCategorySchema } from '../lib/validation'

export const categoryRoutes = new Hono<AppBindings>()

const CATEGORY_USAGE = `
  SELECT c.id, c.name, c.type, c.color, c.icon, c.is_default, c.created_at,
         COUNT(t.id) AS transaction_count,
         ROUND(COALESCE(SUM(t.amount), 0), 2) AS total
    FROM categories c
    LEFT JOIN transactions t ON t.category_id = c.id
`

categoryRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const type = c.req.query('type')
  const scoped = type === 'expense' || type === 'earning'

  const stmt = c.env.DB.prepare(
    `${CATEGORY_USAGE}
      WHERE c.user_id = ?${scoped ? ' AND c.type = ?' : ''}
      GROUP BY c.id
      ORDER BY c.type ASC, c.name COLLATE NOCASE ASC`,
  )

  const { results } = scoped
    ? await stmt.bind(userId, type).all()
    : await stmt.bind(userId).all()

  return c.json({ items: results ?? [] })
})

categoryRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  const parsed = createCategorySchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid category' }, 400)
  }

  const { name, type, color, icon } = parsed.data
  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO categories (user_id, name, type, color, icon, is_default) VALUES (?, ?, ?, ?, ?, 0)',
    )
      .bind(userId, name, type, color, icon?.trim() || null)
      .run()

    const created = await c.env.DB.prepare(
      `${CATEGORY_USAGE} WHERE c.id = ? AND c.user_id = ? GROUP BY c.id`,
    )
      .bind(result.meta.last_row_id as number, userId)
      .first()
    return c.json(created, 201)
  } catch (error) {
    if (/UNIQUE/i.test(String(error))) {
      return c.json({ error: `A ${type} category named "${name}" already exists` }, 409)
    }
    throw error
  }
})

categoryRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const id = Number.parseInt(c.req.param('id'), 10)
  if (!Number.isFinite(id) || id <= 0) return c.json({ error: 'Invalid id' }, 400)

  const existing = await c.env.DB.prepare(
    'SELECT * FROM categories WHERE id = ? AND user_id = ?',
  )
    .bind(id, userId)
    .first<{ id: number; name: string; type: string; color: string; icon: string | null }>()
  if (!existing) return c.json({ error: 'Category not found' }, 404)

  const parsed = updateCategorySchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid category' }, 400)
  }

  const patch = parsed.data
  try {
    await c.env.DB.prepare(
      'UPDATE categories SET name = ?, color = ?, icon = ? WHERE id = ? AND user_id = ?',
    )
      .bind(
        patch.name ?? existing.name,
        patch.color ?? existing.color,
        patch.icon === undefined ? existing.icon : patch.icon?.trim() || null,
        id,
        userId,
      )
      .run()
  } catch (error) {
    if (/UNIQUE/i.test(String(error))) {
      return c.json({ error: 'Another category already uses that name' }, 409)
    }
    throw error
  }

  const updated = await c.env.DB.prepare(
    `${CATEGORY_USAGE} WHERE c.id = ? AND c.user_id = ? GROUP BY c.id`,
  )
    .bind(id, userId)
    .first()
  return c.json(updated)
})

/**
 * Deleting a category that is in use is blocked by default. Passing
 * `?reassign=true` moves its transactions to "Others" (or the closest
 * equivalent) first, which keeps the balance triggers consistent because the
 * amount and type of each moved row do not change.
 */
categoryRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = Number.parseInt(c.req.param('id'), 10)
  if (!Number.isFinite(id) || id <= 0) return c.json({ error: 'Invalid id' }, 400)

  const category = await c.env.DB.prepare(
    'SELECT id, name, type FROM categories WHERE id = ? AND user_id = ?',
  )
    .bind(id, userId)
    .first<{ id: number; name: string; type: string }>()
  if (!category) return c.json({ error: 'Category not found' }, 404)

  const usage = await c.env.DB.prepare(
    'SELECT COUNT(*) AS count FROM transactions WHERE category_id = ? AND user_id = ?',
  )
    .bind(id, userId)
    .first<{ count: number }>()
  const count = usage?.count ?? 0

  if (count > 0) {
    if (c.req.query('reassign') !== 'true') {
      return c.json(
        {
          error: `"${category.name}" is used by ${count} transaction${count === 1 ? '' : 's'}.`,
          transaction_count: count,
        },
        409,
      )
    }

    // The fallback is drawn from this account's own categories only.
    const fallback = await c.env.DB.prepare(
      `SELECT id, name FROM categories
        WHERE type = ? AND id != ? AND user_id = ?
        ORDER BY CASE WHEN name = 'Others' THEN 0 ELSE 1 END, id ASC
        LIMIT 1`,
    )
      .bind(category.type, id, userId)
      .first<{ id: number; name: string }>()

    if (!fallback) {
      return c.json({ error: 'No other category of this type to reassign to' }, 400)
    }

    await c.env.DB.batch([
      c.env.DB.prepare(
        'UPDATE transactions SET category_id = ? WHERE category_id = ? AND user_id = ?',
      ).bind(fallback.id, id, userId),
      c.env.DB.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').bind(id, userId),
    ])

    return c.json({ ok: true, reassigned: count, reassigned_to: fallback.name })
  }

  await c.env.DB.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').bind(id, userId).run()
  return c.json({ ok: true })
})
