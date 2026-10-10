import { Hono } from 'hono'
import type { AppBindings } from '../env'
import { TRANSACTION_SELECT, parseTransactionFilter, transactionFilter } from '../lib/queries'
import { toCSV } from '../lib/util'

export const exportRoutes = new Hono<AppBindings>()

interface ExportRow {
  date: string
  type: string
  category_name: string
  amount: number
  note: string | null
}

exportRoutes.get('/csv', async (c) => {
  const userId = c.get('userId')
  const query = c.req.query()
  const filter = transactionFilter(parseTransactionFilter(query, userId))

  const { results } = await c.env.DB.prepare(
    `${TRANSACTION_SELECT} ${filter.sql} ORDER BY t.date ASC, t.id ASC`,
  )
    .bind(...filter.params)
    .all<ExportRow>()

  const rows: (string | number)[][] = [['Date', 'Type', 'Category', 'Amount', 'Note']]
  for (const row of results ?? []) {
    rows.push([row.date, row.type, row.category_name, row.amount.toFixed(2), row.note ?? ''])
  }

  const range = query.from || query.to ? `-${query.from ?? 'start'}-to-${query.to ?? 'today'}` : ''
  const body = '\uFEFF' + toCSV(rows)

  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="myledger${range}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
})
