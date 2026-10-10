import { Hono } from 'hono'
import type { AppBindings } from '../env'
import { monthBounds, round2 } from '../lib/util'
import { budgetSchema } from '../lib/validation'

export const budgetRoutes = new Hono<AppBindings>()

budgetRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const bounds = monthBounds(c.req.query('month'))

  const { results } = await c.env.DB.prepare(
    `SELECT b.id,
            b.category_id,
            b.amount,
            c.name  AS category_name,
            c.color AS color,
            c.icon  AS icon,
            ROUND(COALESCE((
              SELECT SUM(t.amount) FROM transactions t
               WHERE t.category_id = b.category_id
                 AND t.type = 'expense'
                 AND t.date BETWEEN ?1 AND ?2
            ), 0), 2) AS spent
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
      WHERE b.user_id = ?3
      ORDER BY c.name COLLATE NOCASE ASC`,
  )
    .bind(bounds.start, bounds.end, userId)
    .all()

  return c.json({ month: bounds.month, from: bounds.start, to: bounds.end, items: results ?? [] })
})

budgetRoutes.put('/:categoryId', async (c) => {
  const userId = c.get('userId')
  const categoryId = Number.parseInt(c.req.param('categoryId'), 10)
  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    return c.json({ error: 'Invalid category id' }, 400)
  }

  const parsed = budgetSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Enter a budget above zero' }, 400)

  // Ownership is part of the lookup: another account's category is "not found".
  const category = await c.env.DB.prepare(
    'SELECT id, type FROM categories WHERE id = ? AND user_id = ?',
  )
    .bind(categoryId, userId)
    .first<{ id: number; type: string }>()
  if (!category) return c.json({ error: 'Category not found' }, 404)
  if (category.type !== 'expense') {
    return c.json({ error: 'Budgets only apply to expense categories' }, 400)
  }

  await c.env.DB.prepare(
    `INSERT INTO budgets (user_id, category_id, amount) VALUES (?1, ?2, ?3)
       ON CONFLICT (category_id) DO UPDATE SET amount = excluded.amount`,
  )
    .bind(userId, categoryId, round2(parsed.data.amount))
    .run()

  return c.json({ ok: true })
})

budgetRoutes.delete('/:categoryId', async (c) => {
  const userId = c.get('userId')
  const categoryId = Number.parseInt(c.req.param('categoryId'), 10)
  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    return c.json({ error: 'Invalid category id' }, 400)
  }

  await c.env.DB.prepare('DELETE FROM budgets WHERE category_id = ? AND user_id = ?')
    .bind(categoryId, userId)
    .run()
  return c.json({ ok: true })
})
