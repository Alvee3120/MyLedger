import { useEffect, useState } from 'react'
import type { AdminOverview } from '@shared/types'
import { UsersIcon } from '../components/Icons'
import { EmptyState, Spinner } from '../components/ui'
import { ApiError, api } from '../lib/api'

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: number
  hint?: string
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  )
}

/** D1 hands back `YYYY-MM-DD HH:MM:SS` in UTC; render it as a local date. */
function formatDate(value: string | null): string {
  if (!value) return '—'
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function AdminPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await api.admin.overview()
        if (!cancelled) setOverview(data)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.status === 403
              ? 'This account is not an admin.'
              : 'Could not load the overview.',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (error || !overview) {
    return (
      <div className="card">
        <EmptyState
          icon={<UsersIcon className="h-8 w-8" />}
          title="Not available"
          description={error ?? 'Could not load the overview.'}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Admin</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          How many people are using MyLedger.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total users" value={overview.total_users} />
        <StatCard label="Active (7d)" value={overview.active_users_7d} hint="logged a transaction" />
        <StatCard label="New (7d)" value={overview.new_users_7d} hint="joined this week" />
        <StatCard label="New (30d)" value={overview.new_users_30d} hint="joined this month" />
      </div>

      <section className="card overflow-hidden">
        <div className="px-4 py-3">
          <h2 className="text-sm font-semibold">Users</h2>
        </div>
        {overview.users.length === 0 ? (
          <EmptyState title="No users yet" />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {overview.users.map((user) => (
              <li key={user.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.username}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Joined {formatDate(user.created_at)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm tabular-nums">
                    {user.transaction_count} {user.transaction_count === 1 ? 'entry' : 'entries'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {user.last_activity ? `Active ${formatDate(user.last_activity)}` : 'No activity'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
