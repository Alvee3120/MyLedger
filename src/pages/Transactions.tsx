import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Transaction, TransactionInput, TransactionQuery, TxType } from '@shared/types'
import { TransactionForm } from '../components/TransactionForm'
import { TransactionGroups } from '../components/TransactionList'
import { useToast } from '../components/Toast'
import { EmptyState, Modal, Spinner } from '../components/ui'
import { CloseIcon, ListIcon, SearchIcon } from '../components/Icons'
import { api } from '../lib/api'
import { formatMoney } from '../lib/format'
import { useLedger } from '../state/LedgerProvider'

const PAGE_SIZE = 50

export function TransactionsPage() {
  const { categories, currency, reloadSettings } = useLedger()
  const { notify } = useToast()

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TxType | ''>('')
  const [categoryFilter, setCategoryFilter] = useState<number | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [items, setItems] = useState<Transaction[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)

  // Debounce keystrokes so typing a note search does not fire a request per letter.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const query = useMemo<TransactionQuery>(
    () => ({
      type: typeFilter || undefined,
      category_id: categoryFilter || undefined,
      from: from || undefined,
      to: to || undefined,
      search: search || undefined,
    }),
    [typeFilter, categoryFilter, from, to, search],
  )

  const fetchPage = useCallback(
    async (offset: number) => {
      if (offset === 0) setLoading(true)
      else setLoadingMore(true)

      try {
        const response = await api.transactions.list({ ...query, limit: PAGE_SIZE, offset })
        setItems((current) => (offset === 0 ? response.items : [...current, ...response.items]))
        setTotal(response.total)
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [query],
  )

  useEffect(() => {
    void fetchPage(0)
  }, [fetchPage])

  const hasFilters = Boolean(
    search || typeFilter || categoryFilter || from || to,
  )

  const filteredCategories = typeFilter
    ? categories.filter((category) => category.type === typeFilter)
    : categories

  // Savings movements are shown in the feed but excluded from these main-balance
  // subtotals, which count real income and spending only.
  const rangeTotals = useMemo(() => {
    const spends = items.filter((item) => item.source !== 'savings')
    const expense = spends.reduce(
      (sum, item) => sum + (item.type === 'expense' ? item.amount : 0),
      0,
    )
    const earning = spends.reduce(
      (sum, item) => sum + (item.type === 'earning' ? item.amount : 0),
      0,
    )
    return { expense, earning }
  }, [items])

  async function handleUpdate(input: TransactionInput) {
    if (!editing) return
    await api.transactions.update(editing.id, input)
    setEditing(null)
    await Promise.all([fetchPage(0), reloadSettings()])
    notify('Transaction updated', 'success')
  }

  async function handleDelete() {
    if (!editing) return
    await api.transactions.remove(editing.id)
    setEditing(null)
    await Promise.all([fetchPage(0), reloadSettings()])
    notify('Transaction deleted', 'success')
  }

  function clearFilters() {
    setSearchInput('')
    setSearch('')
    setTypeFilter('')
    setCategoryFilter('')
    setFrom('')
    setTo('')
  }

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search notes…"
            aria-label="Search notes"
            className="input pl-9 pr-9"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="filter-type">
              Type
            </label>
            <select
              id="filter-type"
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value as TxType | '')
                setCategoryFilter('')
              }}
              className="input"
            >
              <option value="">All types</option>
              <option value="expense">Expense</option>
              <option value="earning">Earning</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="filter-category">
              Category
            </label>
            <select
              id="filter-category"
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.target.value ? Number(event.target.value) : '')
              }
              className="input"
            >
              <option value="">All categories</option>
              {filteredCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.icon ? `${category.icon} ` : ''}
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="filter-from">
              From
            </label>
            <input
              id="filter-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="filter-to">
              To
            </label>
            <input
              id="filter-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="input"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {total} entr{total === 1 ? 'y' : 'ies'}
            {hasFilters ? ' matched' : ''}
          </p>
          {hasFilters ? (
            <button type="button" onClick={clearFilters} className="text-xs font-semibold text-brand-600 dark:text-brand-400">
              Clear filters
            </button>
          ) : null}
        </div>

        {items.length > 0 ? (
          <div className="mt-3 flex gap-4 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400">
              Spent{' '}
              <span className="font-semibold text-rose-600 tabular-nums dark:text-rose-400">
                {formatMoney(rangeTotals.expense, currency)}
              </span>
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              Earned{' '}
              <span className="font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                {formatMoney(rangeTotals.earning, currency)}
              </span>
            </span>
          </div>
        ) : null}
      </section>

      <section className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12 text-slate-400">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ListIcon className="h-8 w-8" />}
            title={hasFilters ? 'No matches' : 'No transactions yet'}
            description={
              hasFilters
                ? 'Try widening the date range or clearing the filters.'
                : 'Add your first entry from the Home tab.'
            }
            action={
              hasFilters ? (
                <button type="button" onClick={clearFilters} className="btn-ghost">
                  Clear filters
                </button>
              ) : null
            }
          />
        ) : (
          <>
            <TransactionGroups items={items} currency={currency} onSelect={setEditing} />
            {items.length < total ? (
              <div className="border-t border-slate-100 p-4 dark:border-slate-800">
                <button
                  type="button"
                  className="btn-ghost w-full"
                  disabled={loadingMore}
                  onClick={() => void fetchPage(items.length)}
                >
                  {loadingMore ? <Spinner className="h-4 w-4" /> : null}
                  Load more ({total - items.length} left)
                </button>
              </div>
            ) : null}
          </>
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
