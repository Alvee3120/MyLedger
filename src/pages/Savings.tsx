import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { SavingsEntry, SavingsKind, SavingsState } from '@shared/types'
import { SavingsIcon, TrashIcon } from '../components/Icons'
import { useToast } from '../components/Toast'
import { ConfirmDialog, EmptyState, Modal, Spinner } from '../components/ui'
import { ApiError, api } from '../lib/api'
import { formatDateGroup, todayISO } from '../lib/dates'
import { formatMoney } from '../lib/format'
import { useLedger } from '../state/LedgerProvider'

/** Keeps the field to digits and a single decimal point, max two places. */
function sanitiseAmount(raw: string): string {
  const stripped = raw.replace(/[^0-9.]/g, '')
  const [head, ...rest] = stripped.split('.')
  return rest.length ? `${head}.${rest.join('').slice(0, 2)}` : head!
}

function groupByDate(items: SavingsEntry[]): [string, SavingsEntry[]][] {
  const groups = new Map<string, SavingsEntry[]>()
  for (const item of items) {
    const existing = groups.get(item.date)
    if (existing) existing.push(item)
    else groups.set(item.date, [item])
  }
  return [...groups.entries()]
}

function SavingsForm({
  kind,
  available,
  currency,
  onSubmit,
}: {
  kind: SavingsKind
  available: number
  currency: string
  onSubmit: (input: { amount: number; note: string | null; date: string }) => Promise<void>
}) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)

  const parsed = Number(amount)
  const amountValid = Number.isFinite(parsed) && parsed > 0
  const overBudget = amountValid && parsed > available
  const canSubmit = amountValid && !overBudget && !busy

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    try {
      await onSubmit({
        amount: Math.round((parsed + Number.EPSILON) * 100) / 100,
        note: note.trim() ? note.trim() : null,
        date,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
        <span className="text-2xl font-semibold text-slate-400 dark:text-slate-500">
          {currency}
        </span>
        <input
          value={amount}
          onChange={(event) => setAmount(sanitiseAmount(event.target.value))}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          placeholder="0"
          aria-label="Amount"
          className="w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-300 dark:placeholder:text-slate-700"
        />
      </div>

      <p className={`text-xs ${overBudget ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
        {kind === 'deposit'
          ? `You can save up to ${formatMoney(available, currency)} (your main balance).`
          : `You can spend up to ${formatMoney(available, currency)} from savings.`}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="savings-date">
            Date
          </label>
          <input
            id="savings-date"
            type="date"
            value={date}
            max="2999-12-31"
            onChange={(event) => setDate(event.target.value || todayISO())}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="savings-note">
            Note <span className="font-normal normal-case">(optional)</span>
          </label>
          <input
            id="savings-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            placeholder="e.g. Eid fund"
            className="input"
          />
        </div>
      </div>

      <button type="submit" disabled={!canSubmit} className="btn-primary w-full py-3">
        {busy ? <Spinner className="h-4 w-4" /> : null}
        {kind === 'deposit' ? 'Add to savings' : 'Spend from savings'}
      </button>
    </form>
  )
}

export function SavingsPage() {
  const { currency, reloadSettings } = useLedger()
  const { notify } = useToast()

  const [state, setState] = useState<SavingsState | null>(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<SavingsKind | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SavingsEntry | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setState(await api.savings.get())
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

  const groups = useMemo(() => groupByDate(state?.items ?? []), [state])

  async function handleMutation(
    kind: SavingsKind,
    input: { amount: number; note: string | null; date: string },
  ) {
    try {
      if (kind === 'deposit') await api.savings.deposit(input)
      else await api.savings.spend(input)

      setAction(null)
      // The main balance moves with a deposit, so refresh the shared settings too.
      await Promise.all([load(), reloadSettings()])
      notify(kind === 'deposit' ? 'Added to savings' : 'Spent from savings', 'success')
    } catch (caught) {
      notify(caught instanceof ApiError ? caught.message : 'Could not complete that', 'error')
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.savings.remove(pendingDelete.id)
      setPendingDelete(null)
      await Promise.all([load(), reloadSettings()])
      notify('Entry removed', 'success')
    } catch (caught) {
      notify(caught instanceof ApiError ? caught.message : 'Could not remove that entry', 'error')
    } finally {
      setDeleting(false)
    }
  }

  if (loading || !state) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <div className="px-5 pt-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <SavingsIcon className="h-4 w-4" />
            Savings
          </div>
          <p className="mt-1 text-4xl font-bold tabular-nums text-brand-600 dark:text-brand-400">
            {formatMoney(state.savings_balance, currency)}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {formatMoney(state.current_balance, currency)} available in your main balance
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 p-4">
          <button type="button" className="btn-primary" onClick={() => setAction('deposit')}>
            Add to savings
          </button>
          <button type="button" className="btn-ghost" onClick={() => setAction('spend')}>
            Spend from savings
          </button>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="px-4 py-3">
          <h2 className="text-sm font-semibold">Activity</h2>
        </div>
        {groups.length === 0 ? (
          <EmptyState
            icon={<SavingsIcon className="h-8 w-8" />}
            title="Nothing saved yet"
            description="Move some money out of your main balance to start building your savings."
          />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {groups.map(([date, entries]) => (
              <div key={date}>
                <div className="bg-slate-50/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/40 dark:text-slate-400">
                  {formatDateGroup(date)}
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {entries.map((entry) => {
                    const isDeposit = entry.kind === 'deposit'
                    return (
                      <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/15 text-base">
                          🏦
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {isDeposit ? 'Added to savings' : 'Spent from savings'}
                          </span>
                          {entry.note ? (
                            <span className="block truncate text-sm text-slate-500 dark:text-slate-400">
                              {entry.note}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={`shrink-0 font-semibold tabular-nums ${
                            isDeposit
                              ? 'text-brand-600 dark:text-brand-400'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {isDeposit ? '+' : '−'}
                          {formatMoney(entry.amount, currency)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(entry)}
                          aria-label="Remove entry"
                          className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800 dark:hover:text-rose-400"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={action !== null}
        title={action === 'deposit' ? 'Add to savings' : 'Spend from savings'}
        onClose={() => setAction(null)}
      >
        {action ? (
          <SavingsForm
            kind={action}
            available={action === 'deposit' ? state.current_balance : state.savings_balance}
            currency={currency}
            onSubmit={(input) => handleMutation(action, input)}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove entry"
        message="Remove this savings entry? Both balances will be put back the way they were."
        confirmLabel="Remove"
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
