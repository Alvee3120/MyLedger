import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Budget, Summary, Transaction, TransactionInput } from '@shared/types'
import { BalanceCard } from '../components/BalanceCard'
import { SavingsIcon } from '../components/Icons'
import { TransactionForm } from '../components/TransactionForm'
import { TransactionGroups } from '../components/TransactionList'
import { Modal, Spinner } from '../components/ui'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { monthKey, rangeFor, todayISO } from '../lib/dates'
import { formatMoney } from '../lib/format'
import { useLedger } from '../state/LedgerProvider'

function BudgetStrip({ budgets, currency }: { budgets: Budget[]; currency: string }) {
  if (budgets.length === 0) return null

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Budgets this month</h2>
        <Link to="/categories" className="text-xs font-semibold text-brand-600 dark:text-brand-400">
          Manage
        </Link>
      </div>
      <ul className="space-y-3">
        {budgets.map((budget) => {
          const ratio = budget.amount > 0 ? budget.spent / budget.amount : 0
          const over = ratio > 1
          const close = !over && ratio >= 0.8

          return (
            <li key={budget.id}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="truncate font-medium">
                  {budget.icon ? <span className="mr-1">{budget.icon}</span> : null}
                  {budget.category_name}
                </span>
                <span
                  className={`ml-3 shrink-0 tabular-nums ${
                    over
                      ? 'font-semibold text-rose-600 dark:text-rose-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {formatMoney(budget.spent, currency)} / {formatMoney(budget.amount, currency)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all ${
                    over ? 'bg-rose-500' : close ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                />
              </div>
              {over ? (
                <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                  Over budget by {formatMoney(budget.spent - budget.amount, currency)}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function SavingsStrip({ balance, currency }: { balance: number; currency: string }) {
  return (
    <Link
      to="/savings"
      className="card flex items-center justify-between gap-3 p-4 transition active:scale-[0.99]"
    >
      <span className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-400">
          <SavingsIcon className="h-5 w-5" />
        </span>
        <span className="text-sm font-semibold">Savings</span>
      </span>
      <span className="text-lg font-bold tabular-nums text-brand-600 dark:text-brand-400">
        {formatMoney(balance, currency)}
      </span>
    </Link>
  )
}

export function DashboardPage() {
  const { settings, categories, currency, reloadSettings } = useLedger()
  const { notify } = useToast()

  const [recent, setRecent] = useState<Transaction[]>([])
  const [today, setToday] = useState<Summary | null>(null)
  const [month, setMonth] = useState<Summary | null>(null)
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Transaction | null>(null)

  const load = useCallback(async () => {
    const todayDate = todayISO()
    const monthRange = rangeFor('month')

    const [transactions, todaySummary, monthSummary, budgetData] = await Promise.all([
      api.transactions.list({ limit: 8 }),
      api.reports.summary({ from: todayDate, to: todayDate }),
      monthRange
        ? api.reports.summary({ from: monthRange.from, to: monthRange.to })
        : api.reports.summary(),
      api.budgets.list(monthKey()),
    ])

    setRecent(transactions.items)
    setToday(todaySummary)
    setMonth(monthSummary)
    setBudgets(budgetData.items)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await load()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  async function handleAdd(input: TransactionInput) {
    await api.transactions.create(input)
    await Promise.all([load(), reloadSettings()])
    notify(input.type === 'expense' ? 'Expense added' : 'Earning added', 'success')
  }

  async function handleUpdate(input: TransactionInput) {
    if (!editing) return
    await api.transactions.update(editing.id, input)
    setEditing(null)
    await Promise.all([load(), reloadSettings()])
    notify('Transaction updated', 'success')
  }

  async function handleDelete() {
    if (!editing) return
    await api.transactions.remove(editing.id)
    setEditing(null)
    await Promise.all([load(), reloadSettings()])
    notify('Transaction deleted', 'success')
  }

  return (
    <div className="space-y-4">
      <BalanceCard
        balance={settings.current_balance}
        currency={currency}
        stats={[
          { label: 'Today', value: today?.net ?? 0 },
          { label: 'Spent (mo)', value: month?.total_expense ?? 0, tone: 'negative' },
          { label: 'Earned (mo)', value: month?.total_earning ?? 0, tone: 'positive' },
        ]}
      />

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Quick add</h2>
        <TransactionForm categories={categories} currency={currency} onSubmit={handleAdd} />
      </section>

      <SavingsStrip balance={settings.savings_balance} currency={currency} />

      <BudgetStrip budgets={budgets} currency={currency} />

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sm font-semibold">Recent</h2>
          <Link to="/transactions" className="text-xs font-semibold text-brand-600 dark:text-brand-400">
            View all
          </Link>
        </div>
        {loading ? (
          <div className="flex justify-center py-10 text-slate-400">
            <Spinner />
          </div>
        ) : (
          <TransactionGroups
            items={recent}
            currency={currency}
            onSelect={setEditing}
            emptyMessage="No transactions yet — add your first one above."
          />
        )}
      </section>

      <Modal open={Boolean(editing)} title="Edit transaction" onClose={() => setEditing(null)}>
        {editing ? (
          <TransactionForm
            categories={categories}
            currency={currency}
            initial={editing}
            onSubmit={handleUpdate}
            onDelete={handleDelete}
          />
        ) : null}
      </Modal>
    </div>
  )
}
