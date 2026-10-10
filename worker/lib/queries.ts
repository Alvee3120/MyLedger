import type { TxType } from '@shared/types'

export interface FilterInput {
  /** Owners-only: every query is scoped to one account. */
  userId: number
  from?: string
  to?: string
  type?: TxType
  category_id?: number
  search?: string
}

export interface SqlFragment {
  /** Either an empty string or `WHERE ...`, always aliasing transactions as `t`. */
  sql: string
  params: (string | number)[]
}

/** Escapes LIKE wildcards so a note search for "50%" is treated literally. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, '\\$&')}%`
}

export function transactionFilter(input: FilterInput): SqlFragment {
  // user_id always comes first and is never optional — this is the tenant fence.
  const clauses: string[] = ['t.user_id = ?']
  const params: (string | number)[] = [input.userId]

  if (input.from) {
    clauses.push('t.date >= ?')
    params.push(input.from)
  }
  if (input.to) {
    clauses.push('t.date <= ?')
    params.push(input.to)
  }
  if (input.type) {
    clauses.push('t.type = ?')
    params.push(input.type)
  }
  if (input.category_id) {
    clauses.push('t.category_id = ?')
    params.push(input.category_id)
  }
  if (input.search) {
    clauses.push("t.note LIKE ? ESCAPE '\\'")
    params.push(likePattern(input.search))
  }

  return { sql: `WHERE ${clauses.join(' AND ')}`, params }
}

/**
 * The savings half of the History feed. Same date and note-search semantics as
 * `transactionFilter`, but aliased as `s` and with no category or type — savings
 * entries have neither, so callers simply omit this fragment when those filters
 * are active.
 */
export function savingsFilter(input: FilterInput): SqlFragment {
  const clauses: string[] = ['s.user_id = ?']
  const params: (string | number)[] = [input.userId]

  if (input.from) {
    clauses.push('s.date >= ?')
    params.push(input.from)
  }
  if (input.to) {
    clauses.push('s.date <= ?')
    params.push(input.to)
  }
  if (input.search) {
    clauses.push("s.note LIKE ? ESCAPE '\\'")
    params.push(likePattern(input.search))
  }

  return { sql: `WHERE ${clauses.join(' AND ')}`, params }
}

export function parseTransactionFilter(
  query: Record<string, string | undefined>,
  userId: number,
): FilterInput {
  const isDate = (value?: string): value is string =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

  const categoryId = Number.parseInt(query.category_id ?? '', 10)

  return {
    userId,
    from: isDate(query.from) ? query.from : undefined,
    to: isDate(query.to) ? query.to : undefined,
    type: query.type === 'expense' || query.type === 'earning' ? query.type : undefined,
    category_id: Number.isFinite(categoryId) && categoryId > 0 ? categoryId : undefined,
    search: query.search?.trim() || undefined,
  }
}

/** Buckets are emitted as ISO dates so the client can label and chart them. */
export const BUCKET_EXPRESSION: Record<string, string> = {
  day: 'date(t.date)',
  week: "date(t.date, 'weekday 0', '-6 days')",
  month: "strftime('%Y-%m-01', t.date)",
  year: "strftime('%Y-01-01', t.date)",
}

export const TRANSACTION_SELECT = `
  SELECT t.id, t.type, t.amount, t.category_id, t.note, t.date, t.created_at,
         c.name  AS category_name,
         c.color AS category_color,
         c.icon  AS category_icon
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
`
