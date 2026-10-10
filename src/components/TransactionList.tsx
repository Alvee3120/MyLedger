import { useMemo } from 'react'
import type { Transaction } from '@shared/types'
import { formatDateGroup } from '../lib/dates'
import { formatMoney } from '../lib/format'

export function groupByDate(items: Transaction[]): [string, Transaction[]][] {
  const groups = new Map<string, Transaction[]>()
  for (const item of items) {
    const existing = groups.get(item.date)
    if (existing) existing.push(item)
    else groups.set(item.date, [item])
  }
  return [...groups.entries()]
}

export function TransactionRow({
  transaction,
  currency,
  onSelect,
}: {
  transaction: Transaction
  currency: string
  onSelect?: (transaction: Transaction) => void
}) {
  // Savings movements ride along in the History feed but own no category and are
  // not editable here, so they render as a read-only, clearly-labelled row.
  if (transaction.source === 'savings') {
    const isDeposit = transaction.savings_kind === 'deposit'
    return (
      <div className="flex w-full items-center gap-3 px-4 py-3">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/15 text-base"
        >
          🏦
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {isDeposit ? 'Added to savings' : 'Spent from savings'}
          </span>
          {transaction.note ? (
            <span className="block truncate text-sm text-slate-500 dark:text-slate-400">
              {transaction.note}
            </span>
          ) : null}
        </span>
        <span
          className={`shrink-0 font-semibold tabular-nums ${
            isDeposit ? 'text-brand-600 dark:text-brand-400' : 'text-slate-700 dark:text-slate-200'
          }`}
        >
          {isDeposit ? '+' : '−'}
          {formatMoney(transaction.amount, currency)}
        </span>
      </div>
    )
  }

  const isExpense = transaction.type === 'expense'

  return (
    <button
      type="button"
      onClick={() => onSelect?.(transaction)}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-slate-50 dark:active:bg-slate-800/60"
    >
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-base"
        style={{ backgroundColor: `${transaction.category_color}22` }}
      >
        {transaction.category_icon ?? (
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: transaction.category_color }} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{transaction.category_name}</span>
        {transaction.note ? (
          <span className="block truncate text-sm text-slate-500 dark:text-slate-400">
            {transaction.note}
          </span>
        ) : null}
      </span>

      <span
        className={`shrink-0 font-semibold tabular-nums ${
          isExpense ? 'text-slate-700 dark:text-slate-200' : 'text-emerald-600 dark:text-emerald-400'
        }`}
      >
        {isExpense ? '−' : '+'}
        {formatMoney(transaction.amount, currency)}
      </span>
    </button>
  )
}

export function TransactionGroups({
  items,
  currency,
  onSelect,
  emptyMessage = 'Nothing here yet.',
}: {
  items: Transaction[]
  currency: string
  onSelect?: (transaction: Transaction) => void
  emptyMessage?: string
}) {
  const groups = useMemo(() => groupByDate(items), [items])

  if (items.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</p>
  }

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {groups.map(([date, transactions]) => {
        // The day's net reflects the main balance only, so savings transfers are
        // left out of the running total.
        const spends = transactions.filter((item) => item.source !== 'savings')
        const dayNet = spends.reduce(
          (sum, item) => sum + (item.type === 'earning' ? item.amount : -item.amount),
          0,
        )
        return (
          <div key={date}>
            <div className="flex items-center justify-between bg-slate-50/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/40 dark:text-slate-400">
              <span>{formatDateGroup(date)}</span>
              {spends.length > 0 ? (
                <span className="tabular-nums normal-case">
                  {dayNet >= 0 ? '+' : '−'}
                  {formatMoney(Math.abs(dayNet), currency)}
                </span>
              ) : null}
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {transactions.map((transaction) => (
                <TransactionRow
                  key={`${transaction.source ?? 'transaction'}-${transaction.id}`}
                  transaction={transaction}
                  currency={currency}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
