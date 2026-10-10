import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { CategoryWithUsage, Transaction, TransactionInput, TxType } from '@shared/types'
import { todayISO } from '../lib/dates'
import { contrastText } from '../lib/format'
import { TrashIcon } from './Icons'
import { Spinner } from './ui'

const lastCategoryKey = (type: TxType) => `myledger.lastCategory.${type}`

function readLastCategory(type: TxType): number | null {
  try {
    const raw = localStorage.getItem(lastCategoryKey(type))
    const parsed = raw ? Number(raw) : Number.NaN
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

function rememberCategory(type: TxType, id: number): void {
  try {
    localStorage.setItem(lastCategoryKey(type), String(id))
  } catch {
    // Storage can be unavailable in private mode; remembering is best-effort.
  }
}

/** Keeps the field to digits and a single decimal point. */
function sanitiseAmount(raw: string): string {
  const stripped = raw.replace(/[^0-9.]/g, '')
  const [head, ...rest] = stripped.split('.')
  return rest.length ? `${head}.${rest.join('').slice(0, 2)}` : head!
}

interface TransactionFormProps {
  categories: CategoryWithUsage[]
  currency: string
  /** Present when editing an existing entry. */
  initial?: Transaction | null
  defaultType?: TxType
  onSubmit: (input: TransactionInput) => Promise<void>
  onDelete?: () => Promise<void>
  submitLabel?: string
}

export function TransactionForm({
  categories,
  currency,
  initial = null,
  defaultType = 'expense',
  onSubmit,
  onDelete,
  submitLabel,
}: TransactionFormProps) {
  const isEdit = Boolean(initial)

  const [type, setType] = useState<TxType>(initial?.type ?? defaultType)
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [categoryId, setCategoryId] = useState<number | null>(initial?.category_id ?? null)
  const [note, setNote] = useState(initial?.note ?? '')
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [busy, setBusy] = useState(false)

  const amountRef = useRef<HTMLInputElement>(null)

  const options = useMemo(
    () => categories.filter((category) => category.type === type),
    [categories, type],
  )

  // Keep the selected category valid for the active type, preferring the one
  // most recently used so repeat entries stay a one-tap affair.
  useEffect(() => {
    if (options.length === 0) {
      setCategoryId(null)
      return
    }
    setCategoryId((current) => {
      if (current && options.some((option) => option.id === current)) return current
      const remembered = readLastCategory(type)
      if (remembered && options.some((option) => option.id === remembered)) return remembered
      return options[0]!.id
    })
  }, [options, type])

  const parsedAmount = Number(amount)
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0
  const canSubmit = amountValid && categoryId !== null && !busy

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit || categoryId === null) return

    setBusy(true)
    try {
      await onSubmit({
        type,
        amount: Math.round((parsedAmount + Number.EPSILON) * 100) / 100,
        category_id: categoryId,
        note: note.trim() ? note.trim() : null,
        date,
      })
      rememberCategory(type, categoryId)

      if (!isEdit) {
        // Reset only what should not carry over, so the next entry is immediate.
        setAmount('')
        setNote('')
        setDate(todayISO())
        amountRef.current?.focus()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {(['expense', 'earning'] as const).map((option) => {
          const active = type === option
          const tone =
            option === 'expense'
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-emerald-600 dark:text-emerald-400'
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => setType(option)}
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                active
                  ? `bg-white shadow-sm dark:bg-slate-700 ${tone}`
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {option === 'expense' ? 'Expense' : 'Earning'}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
        <span className="text-2xl font-semibold text-slate-400 dark:text-slate-500">
          {currency}
        </span>
        <input
          ref={amountRef}
          value={amount}
          onChange={(event) => setAmount(sanitiseAmount(event.target.value))}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          aria-label="Amount"
          className="w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-300 dark:placeholder:text-slate-700"
        />
      </div>

      <div>
        <span className="label">Category</span>
        {options.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No {type} categories yet — add one on the Categories page.
          </p>
        ) : (
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
            {options.map((option) => {
              const active = categoryId === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategoryId(option.id)}
                  style={active ? { backgroundColor: option.color, color: contrastText(option.color) } : undefined}
                  className={`chip ring-1 ${
                    active
                      ? 'ring-transparent'
                      : 'bg-slate-100 text-slate-700 ring-transparent dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  {option.icon ? <span aria-hidden="true">{option.icon}</span> : null}
                  {option.name}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="tx-date">
            Date
          </label>
          <input
            id="tx-date"
            type="date"
            value={date}
            max="2999-12-31"
            onChange={(event) => setDate(event.target.value || todayISO())}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="tx-note">
            Note <span className="font-normal normal-case">(optional)</span>
          </label>
          <input
            id="tx-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            placeholder="e.g. rickshaw fare"
            className="input"
          />
        </div>
      </div>

      <div className="flex gap-2">
        {onDelete ? (
          <button
            type="button"
            onClick={() => void onDelete()}
            disabled={busy}
            aria-label="Delete transaction"
            className="btn-ghost text-rose-600 dark:text-rose-400"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        ) : null}
        <button type="submit" disabled={!canSubmit} className="btn-primary flex-1 py-3">
          {busy ? <Spinner className="h-4 w-4" /> : null}
          {submitLabel ?? (isEdit ? 'Save changes' : type === 'expense' ? 'Add expense' : 'Add earning')}
        </button>
      </div>
    </form>
  )
}
