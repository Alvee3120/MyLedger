import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { CategoryWithUsage, TxType } from '@shared/types'
import { PencilIcon, PlusIcon, TagIcon, TrashIcon } from '../components/Icons'
import { useToast } from '../components/Toast'
import { ConfirmDialog, EmptyState, Modal, Spinner } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { formatMoney } from '../lib/format'
import { useLedger } from '../state/LedgerProvider'

const COLOR_SWATCHES = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#0ea5e9',
  '#3b82f6',
  '#8b5cf6',
  '#a855f7',
  '#ec4899',
  '#64748b',
  '#0f172a',
]

const EMOJI_CHOICES = [
  '🍽️', '🚌', '🛍️', '🐟', '🛒', '💡', '💊', '🎬',
  '📦', '💼', '🧑‍💻', '📈', '🎁', '🏠', '📚', '✈️',
]

interface FormState {
  id: number | null
  name: string
  type: TxType
  color: string
  icon: string
  budget: string
}

const emptyForm = (type: TxType): FormState => ({
  id: null,
  name: '',
  type,
  color: COLOR_SWATCHES[6]!,
  icon: '',
  budget: '',
})

export function CategoriesPage() {
  const { categories, currency, reloadCategories } = useLedger()
  const { notify } = useToast()

  const [form, setForm] = useState<FormState | null>(null)
  const [budgetsByCategory, setBudgetsByCategory] = useState<Record<number, number>>({})
  const [deleteTarget, setDeleteTarget] = useState<CategoryWithUsage | null>(null)
  const [reassignTarget, setReassignTarget] = useState<CategoryWithUsage | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api.budgets
      .list()
      .then((data) => {
        const map: Record<number, number> = {}
        for (const budget of data.items) map[budget.category_id] = budget.amount
        setBudgetsByCategory(map)
      })
      .catch(() => undefined)
  }, [categories])

  const grouped = useMemo(
    () => ({
      expense: categories.filter((category) => category.type === 'expense'),
      earning: categories.filter((category) => category.type === 'earning'),
    }),
    [categories],
  )

  function openCreate(type: TxType) {
    setForm(emptyForm(type))
  }

  function openEdit(category: CategoryWithUsage) {
    setForm({
      id: category.id,
      name: category.name,
      type: category.type,
      color: category.color,
      icon: category.icon ?? '',
      budget: budgetsByCategory[category.id] ? String(budgetsByCategory[category.id]) : '',
    })
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form || !form.name.trim()) return

    setBusy(true)
    try {
      const payload = {
        name: form.name.trim(),
        color: form.color,
        icon: form.icon.trim() || null,
      }

      const saved = form.id
        ? await api.categories.update(form.id, payload)
        : await api.categories.create({ ...payload, type: form.type })

      const categoryId = form.id ?? saved.id
      const budgetValue = Number(form.budget)

      if (form.type === 'expense') {
        if (form.budget.trim() && Number.isFinite(budgetValue) && budgetValue > 0) {
          await api.budgets.set(categoryId, budgetValue)
        } else if (form.id && budgetsByCategory[categoryId]) {
          await api.budgets.remove(categoryId)
        }
      }

      setForm(null)
      await reloadCategories()
      notify(form.id ? 'Category updated' : 'Category created', 'success')
    } catch (caught) {
      notify(caught instanceof ApiError ? caught.message : 'Could not save category', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function removeCategory(category: CategoryWithUsage, reassign: boolean) {
    setBusy(true)
    try {
      const result = await api.categories.remove(category.id, reassign)
      setDeleteTarget(null)
      setReassignTarget(null)
      await reloadCategories()
      notify(
        reassign
          ? `${result.reassigned} entr${result.reassigned === 1 ? 'y' : 'ies'} moved to "${result.reassigned_to}"`
          : 'Category deleted',
        'success',
      )
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setDeleteTarget(null)
        setReassignTarget(category)
      } else {
        notify(caught instanceof ApiError ? caught.message : 'Could not delete category', 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  function renderSection(type: TxType, title: string) {
    const items = grouped[type]

    return (
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={() => openCreate(type)}
            className="btn-ghost px-2.5 py-1.5 text-xs"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add
          </button>
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={<TagIcon className="h-8 w-8" />}
            title={`No ${title.toLowerCase()} yet`}
            description="Categories keep your charts readable."
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((category) => (
              <li key={category.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  aria-hidden="true"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-base"
                  style={{ backgroundColor: `${category.color}22` }}
                >
                  {category.icon ? (
                    category.icon
                  ) : (
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{category.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {category.transaction_count} entr{category.transaction_count === 1 ? 'y' : 'ies'}
                    {category.transaction_count > 0
                      ? ` · ${formatMoney(category.total, currency)}`
                      : ''}
                    {budgetsByCategory[category.id]
                      ? ` · budget ${formatMoney(budgetsByCategory[category.id]!, currency)}`
                      : ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => openEdit(category)}
                  aria-label={`Edit ${category.name}`}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(category)}
                  aria-label={`Delete ${category.name}`}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  return (
    <div className="space-y-4">
      {renderSection('expense', 'Expense categories')}
      {renderSection('earning', 'Earning categories')}

      <Modal
        open={Boolean(form)}
        title={form?.id ? 'Edit category' : 'New category'}
        onClose={() => setForm(null)}
      >
        {form ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {!form.id ? (
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                {(['expense', 'earning'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setForm({ ...form, type: option })}
                    className={`rounded-lg py-2 text-sm font-semibold transition ${
                      form.type === option
                        ? 'bg-white shadow-sm dark:bg-slate-700'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {option === 'expense' ? 'Expense' : 'Earning'}
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                Categories of type <strong>{form.type}</strong> cannot be moved to the other type,
                because existing entries would become invalid.
              </p>
            )}

            <div>
              <label className="label" htmlFor="category-name">
                Name
              </label>
              <input
                id="category-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                maxLength={60}
                autoFocus
                placeholder="e.g. Fish & Meat"
                className="input"
              />
            </div>

            <div>
              <label className="label" htmlFor="category-icon">
                Icon <span className="font-normal normal-case">(optional)</span>
              </label>
              <input
                id="category-icon"
                value={form.icon}
                onChange={(event) => setForm({ ...form, icon: event.target.value })}
                maxLength={8}
                placeholder="🍽️"
                className="input"
              />
              <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-1">
                {EMOJI_CHOICES.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setForm({ ...form, icon: emoji })}
                    className="shrink-0 rounded-lg px-2 py-1 text-lg transition hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="label">Colour</span>
              <div className="flex flex-wrap gap-2">
                {COLOR_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Use colour ${color}`}
                    aria-pressed={form.color.toLowerCase() === color}
                    onClick={() => setForm({ ...form, color })}
                    style={{ backgroundColor: color }}
                    className={`h-8 w-8 rounded-full transition ${
                      form.color.toLowerCase() === color
                        ? 'ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-900'
                        : ''
                    }`}
                  />
                ))}
                <input
                  type="color"
                  value={form.color}
                  onChange={(event) => setForm({ ...form, color: event.target.value })}
                  aria-label="Custom colour"
                  className="h-8 w-8 cursor-pointer rounded-full border-0 bg-transparent p-0"
                />
              </div>
            </div>

            {form.type === 'expense' ? (
              <div>
                <label className="label" htmlFor="category-budget">
                  Monthly budget <span className="font-normal normal-case">(optional)</span>
                </label>
                <input
                  id="category-budget"
                  value={form.budget}
                  onChange={(event) => setForm({ ...form, budget: event.target.value.replace(/[^0-9.]/g, '') })}
                  inputMode="decimal"
                  placeholder={`e.g. 8000 (${currency})`}
                  className="input"
                />
              </div>
            ) : null}

            <div className="flex gap-2">
              <button type="button" className="btn-ghost flex-1" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary flex-1"
                disabled={busy || !form.name.trim()}
              >
                {busy ? <Spinner className="h-4 w-4" /> : null}
                {form.id ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete category"
        message={
          <>
            Delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
          </>
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && void removeCategory(deleteTarget, false)}
        busy={busy}
      />

      <ConfirmDialog
        open={Boolean(reassignTarget)}
        title="Category is in use"
        confirmLabel="Move & delete"
        message={
          <>
            <strong>{reassignTarget?.name}</strong> has{' '}
            {reassignTarget?.transaction_count} transaction
            {reassignTarget?.transaction_count === 1 ? '' : 's'}. Move them to the{' '}
            <strong>Others</strong> category and delete it?
          </>
        }
        onCancel={() => setReassignTarget(null)}
        onConfirm={() => reassignTarget && void removeCategory(reassignTarget, true)}
        busy={busy}
      />
    </div>
  )
}
