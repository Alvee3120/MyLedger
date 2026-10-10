import type { TxType } from '@shared/types'

export interface SeedCategory {
  name: string
  type: TxType
  color: string
  icon: string
  is_default: number
}

/**
 * Every new account starts with this same set, owned by that account. The
 * categories are copied per user rather than shared, so renaming or deleting
 * one never affects anybody else.
 */
export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { name: 'Food', type: 'expense', color: '#ef4444', icon: '🍽️', is_default: 1 },
  { name: 'Transportation', type: 'expense', color: '#3b82f6', icon: '🚌', is_default: 1 },
  { name: 'Shopping', type: 'expense', color: '#a855f7', icon: '🛍️', is_default: 1 },
  { name: 'Fish & Meat', type: 'expense', color: '#ec4899', icon: '🐟', is_default: 1 },
  { name: 'Groceries', type: 'expense', color: '#22c55e', icon: '🛒', is_default: 1 },
  { name: 'Bills & Utilities', type: 'expense', color: '#eab308', icon: '💡', is_default: 1 },
  { name: 'Health', type: 'expense', color: '#14b8a6', icon: '💊', is_default: 1 },
  { name: 'Entertainment', type: 'expense', color: '#f97316', icon: '🎬', is_default: 1 },
  { name: 'Others', type: 'expense', color: '#64748b', icon: '📦', is_default: 0 },
  { name: 'Salary', type: 'earning', color: '#16a34a', icon: '💼', is_default: 1 },
  { name: 'Freelance', type: 'earning', color: '#0ea5e9', icon: '🧑‍💻', is_default: 1 },
  { name: 'Business', type: 'earning', color: '#8b5cf6', icon: '📈', is_default: 1 },
  { name: 'Gift', type: 'earning', color: '#f43f5e', icon: '🎁', is_default: 1 },
  { name: 'Others', type: 'earning', color: '#64748b', icon: '📦', is_default: 0 },
]

/**
 * Statements that give a brand-new account its settings row and categories.
 *
 * The user id is resolved with `SELECT id FROM users WHERE username = ?` rather
 * than a `last_row_id`, so the whole sign-up can run as ONE batch: the account,
 * its settings and its 14 categories commit together or not at all. That avoids
 * a half-created account (a user row with no settings) if anything fails.
 */
export function seedStatementsFor(
  db: D1Database,
  username: string,
): D1PreparedStatement[] {
  return [
    db.prepare('INSERT INTO settings (user_id) SELECT id FROM users WHERE username = ?').bind(username),
    ...DEFAULT_CATEGORIES.map((category) =>
      db
        .prepare(
          `INSERT INTO categories (user_id, name, type, color, icon, is_default)
           SELECT id, ?1, ?2, ?3, ?4, ?5 FROM users WHERE username = ?6`,
        )
        .bind(category.name, category.type, category.color, category.icon, category.is_default, username),
    ),
  ]
}
