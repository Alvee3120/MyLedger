import { z } from 'zod'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/

export const txTypeSchema = z.enum(['expense', 'earning'])

export const createTransactionSchema = z.object({
  type: txTypeSchema,
  amount: z.number().finite().positive().max(1_000_000_000_000),
  category_id: z.number().int().positive(),
  note: z.string().trim().max(500).nullish(),
  date: z.string().regex(ISO_DATE, 'Expected YYYY-MM-DD').optional(),
})

export const updateTransactionSchema = createTransactionSchema.partial()

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: txTypeSchema,
  color: z.string().regex(HEX_COLOR, 'Expected a hex colour').default('#64748b'),
  icon: z.string().trim().max(8).nullish(),
})

// `type` is immutable: moving a category between expense and earning would
// silently invalidate every transaction already filed under it.
export const updateCategorySchema = createCategorySchema.omit({ type: true }).partial()

export const updateSettingsSchema = z.object({
  currency_symbol: z.string().trim().min(1).max(4).optional(),
  opening_balance: z.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000).optional(),
})

export const passwordSchema = z.object({
  password: z.string().min(4, 'Use at least 4 characters').max(200),
})

/**
 * Usernames are folded to lower case at the edge so "Alvee" and "alvee" are the
 * same account. Case-sensitive usernames on a phone keyboard are a needless
 * source of "wrong password" confusion.
 */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME, 'Use 3-32 characters: letters, numbers, and . _ -')

/** First-run only: creates the single account. */
export const signupSchema = z.object({
  username: usernameSchema,
  password: z.string().min(4, 'Use at least 4 characters').max(200),
})

/**
 * Sign-in is deliberately looser than sign-up — it only normalises, so a stored
 * value can never become unreachable because the rules were tightened later.
 */
export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(64),
  password: z.string().min(1).max(200),
})

export const budgetSchema = z.object({
  amount: z.number().finite().positive().max(1_000_000_000_000),
})

/** A deposit into, or a spend from, the savings pot. */
export const savingsEntrySchema = z.object({
  amount: z.number().finite().positive().max(1_000_000_000_000),
  note: z.string().trim().max(500).nullish(),
  date: z.string().regex(ISO_DATE, 'Expected YYYY-MM-DD').optional(),
})

export const bucketSchema = z.enum(['day', 'week', 'month', 'year'])
