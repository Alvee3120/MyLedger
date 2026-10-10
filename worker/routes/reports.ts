import { Hono } from 'hono'
import type { AppBindings } from '../env'
import {
  BUCKET_EXPRESSION,
  parseTransactionFilter,
  savingsFilter,
  transactionFilter,
} from '../lib/queries'
import { monthBounds, round2 } from '../lib/util'

export const reportRoutes = new Hono<AppBindings>()

const TOTALS = `
  ROUND(COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0), 2) AS total_expense,
  ROUND(COALESCE(SUM(CASE WHEN t.type = 'earning' THEN t.amount ELSE 0 END), 0), 2) AS total_earning,
  COUNT(t.id) AS transaction_count
`

reportRoutes.get('/summary', async (c) => {
  const userId = c.get('userId')
  const query = c.req.query()
  const input = parseTransactionFilter(query, userId)
  const filter = transactionFilter(input)

  const savingsClauses = ['user_id = ?']
  const savingsParams: (string | number)[] = [userId]
  if (input.from) {
    savingsClauses.push('date >= ?')
    savingsParams.push(input.from)
  }
  if (input.to) {
    savingsClauses.push('date <= ?')
    savingsParams.push(input.to)
  }

  const [totals, settings, savings] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT ${TOTALS} FROM transactions t ${filter.sql}`).bind(...filter.params),
    c.env.DB.prepare(
      'SELECT current_balance, savings_balance, currency_symbol FROM settings WHERE user_id = ?',
    ).bind(userId),
    c.env.DB.prepare(
      `SELECT ROUND(COALESCE(SUM(CASE WHEN kind = 'spend' THEN amount ELSE 0 END), 0), 2) AS spent,
              ROUND(COALESCE(SUM(CASE WHEN kind = 'deposit' THEN amount ELSE 0 END), 0), 2) AS deposited
         FROM savings_entries
        WHERE ${savingsClauses.join(' AND ')}`,
    ).bind(...savingsParams),
  ])

  const row = (totals?.results?.[0] ?? {}) as {
    total_expense?: number
    total_earning?: number
    transaction_count?: number
  }
  const meta = (settings?.results?.[0] ?? {}) as {
    current_balance?: number
    savings_balance?: number
    currency_symbol?: string
  }
  const savingsRow = (savings?.results?.[0] ?? {}) as { spent?: number; deposited?: number }

  const totalEarning = round2(row.total_earning ?? 0)
  const savingsSpent = round2(savingsRow.spent ?? 0)
  const savingsDeposited = round2(savingsRow.deposited ?? 0)
  // Spending out of savings is real money leaving, so it counts as an expense.
  // Deposits are a transfer into your own pot, so they stay out of the totals.
  const totalExpense = round2((row.total_expense ?? 0) + savingsSpent)

  return c.json({
    from: query.from ?? null,
    to: query.to ?? null,
    total_expense: totalExpense,
    total_earning: totalEarning,
    net: round2(totalEarning - totalExpense),
    transaction_count: row.transaction_count ?? 0,
    current_balance: round2(meta.current_balance ?? 0),
    savings_balance: round2(meta.savings_balance ?? 0),
    savings_deposited: savingsDeposited,
    savings_spent: savingsSpent,
    currency_symbol: meta.currency_symbol ?? '৳',
  })
})

interface BreakdownRow {
  category_id: number
  category_name: string
  color: string
  icon: string | null
  total: number
  count: number
}

reportRoutes.get('/by-category', async (c) => {
  const userId = c.get('userId')
  const input = parseTransactionFilter(c.req.query(), userId)
  const filter = transactionFilter(input)

  const { results } = await c.env.DB.prepare(
    `SELECT c.id   AS category_id,
            c.name AS category_name,
            c.color,
            c.icon,
            c.type,
            ROUND(COALESCE(SUM(t.amount), 0), 2) AS total,
            COUNT(t.id) AS count
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       ${filter.sql}
      GROUP BY c.id
      ORDER BY total DESC`,
  )
    .bind(...filter.params)
    .all<BreakdownRow>()

  const items: BreakdownRow[] = [...(results ?? [])]

  // Spending from savings is an expense with no category, so it shows up as its
  // own slice whenever the breakdown is expense-shaped.
  if (!input.type || input.type === 'expense') {
    const clauses = ['user_id = ?', "kind = 'spend'"]
    const params: (string | number)[] = [userId]
    if (input.from) {
      clauses.push('date >= ?')
      params.push(input.from)
    }
    if (input.to) {
      clauses.push('date <= ?')
      params.push(input.to)
    }

    const savingsRow = await c.env.DB.prepare(
      `SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS total, COUNT(*) AS count
         FROM savings_entries WHERE ${clauses.join(' AND ')}`,
    )
      .bind(...params)
      .first<{ total: number; count: number }>()

    if (savingsRow && savingsRow.total > 0) {
      items.push({
        category_id: 0,
        category_name: 'Savings',
        color: '#0ea5e9',
        icon: '🏦',
        total: round2(savingsRow.total),
        count: savingsRow.count,
      })
    }
  }

  const grandTotal = round2(items.reduce((sum, item) => sum + item.total, 0))

  return c.json({
    grand_total: grandTotal,
    items: items.map((item) => ({
      ...item,
      share: grandTotal > 0 ? round2((item.total / grandTotal) * 100) : 0,
    })),
  })
})

reportRoutes.get('/timeseries', async (c) => {
  const userId = c.get('userId')
  const query = c.req.query()
  const bucket = BUCKET_EXPRESSION[query.bucket ?? 'day'] ? (query.bucket ?? 'day') : 'day'
  const input = parseTransactionFilter(query, userId)
  const filter = transactionFilter(input)

  const branches = [
    `SELECT (${BUCKET_EXPRESSION[bucket]}) AS bucket,
            CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END AS expense,
            CASE WHEN t.type = 'earning' THEN t.amount ELSE 0 END AS earning
       FROM transactions t
       ${filter.sql}`,
  ]
  const params: (string | number)[] = [...filter.params]

  // Savings spends are expenses, so they fold into the expense bars. Deposits are
  // transfers and stay out of the chart entirely.
  if (!input.type || input.type === 'expense') {
    const sFilter = savingsFilter(input)
    branches.push(
      `SELECT (${BUCKET_EXPRESSION[bucket].replace(/t\./g, 's.')}) AS bucket,
              CASE WHEN s.kind = 'spend' THEN s.amount ELSE 0 END AS expense,
              0 AS earning
         FROM savings_entries s
         ${sFilter.sql}`,
    )
    params.push(...sFilter.params)
  }

  const { results } = await c.env.DB.prepare(
    `SELECT bucket,
            ROUND(COALESCE(SUM(expense), 0), 2) AS expense,
            ROUND(COALESCE(SUM(earning), 0), 2) AS earning
       FROM (${branches.join('\nUNION ALL\n')})
      GROUP BY bucket
      ORDER BY bucket ASC`,
  )
    .bind(...params)
    .all<{ bucket: string; expense: number; earning: number }>()

  return c.json({
    bucket,
    items: (results ?? []).map((row) => ({
      bucket: row.bucket,
      label: row.bucket,
      expense: round2(row.expense),
      earning: round2(row.earning),
      net: round2(row.earning - row.expense),
    })),
  })
})

reportRoutes.get('/insights', async (c) => {
  const userId = c.get('userId')
  const bounds = monthBounds(c.req.query('month'))
  const symbol = await c.env.DB.prepare('SELECT currency_symbol FROM settings WHERE user_id = ?')
    .bind(userId)
    .first<{ currency_symbol: string }>()

  const currency = symbol?.currency_symbol ?? '৳'

  // Two rolling months in one pass: each row carries its own current/previous totals.
  const { results } = await c.env.DB.prepare(
    `SELECT c.id   AS category_id,
            c.name AS category_name,
            c.color,
            ROUND(COALESCE(SUM(CASE WHEN t.date >= ?1 THEN t.amount ELSE 0 END), 0), 2) AS current_total,
            ROUND(COALESCE(SUM(CASE WHEN t.date >= ?2 AND t.date < ?1 THEN t.amount ELSE 0 END), 0), 2) AS previous_total
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
      WHERE t.type = 'expense' AND t.date >= ?2 AND t.user_id = ?3
      GROUP BY c.id
      HAVING current_total > 0 OR previous_total > 0
      ORDER BY current_total DESC`,
  )
    .bind(bounds.start, bounds.prevStart, userId)
    .all<{
      category_id: number
      category_name: string
      color: string
      current_total: number
      previous_total: number
    }>()

  const rows = results ?? []
  const currentTotal = round2(rows.reduce((sum, row) => sum + row.current_total, 0))
  const previousTotal = round2(rows.reduce((sum, row) => sum + row.previous_total, 0))

  const insights: { kind: 'up' | 'down' | 'info'; text: string }[] = []
  const money = (value: number) =>
    `${currency}${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

  if (previousTotal > 0 && currentTotal !== previousTotal) {
    const change = round2(((currentTotal - previousTotal) / previousTotal) * 100)
    const direction = change > 0 ? 'more' : 'less'
    insights.push({
      kind: change > 0 ? 'up' : 'down',
      text: `You have spent ${Math.abs(change)}% ${direction} this month than last month (${money(currentTotal)} vs ${money(previousTotal)}).`,
    })
  }

  const biggest = rows[0]
  if (biggest && currentTotal > 0) {
    const share = round2((biggest.current_total / currentTotal) * 100)
    insights.push({
      kind: 'info',
      text: `${biggest.category_name} is your biggest expense this month — ${money(biggest.current_total)} (${share}% of spending).`,
    })
  }

  for (const row of rows.slice(0, 5)) {
    if (row.previous_total < 500 || row.current_total <= row.previous_total) continue
    const change = round2(((row.current_total - row.previous_total) / row.previous_total) * 100)
    if (change < 25) continue
    insights.push({
      kind: 'up',
      text: `${row.category_name} is up ${change}% compared to last month.`,
    })
    if (insights.length >= 4) break
  }

  if (!insights.length) {
    insights.push({
      kind: 'info',
      text: 'Not enough history yet — log a few more transactions and trends will show up here.',
    })
  }

  return c.json({ month: bounds.month, currency_symbol: currency, items: insights })
})
