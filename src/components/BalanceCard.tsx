import { formatMoney, balanceTone } from '../lib/format'
import { WalletIcon } from './Icons'

export interface BalanceStat {
  label: string
  value: number
  tone?: 'default' | 'positive' | 'negative'
}

export function BalanceCard({
  balance,
  currency,
  stats = [],
}: {
  balance: number
  currency: string
  stats?: BalanceStat[]
}) {
  return (
    <section className="card overflow-hidden">
      <div className="px-5 pt-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <WalletIcon className="h-4 w-4" />
          Current balance
        </div>
        <p className={`mt-1 text-4xl font-bold tabular-nums ${balanceTone(balance)}`}>
          {formatMoney(balance, currency)}
        </p>
      </div>

      {stats.length > 0 ? (
        <dl className="mt-4 grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {stats.map((stat) => (
            <div key={stat.label} className="px-3 py-3 text-center">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {stat.label}
              </dt>
              <dd
                className={`mt-0.5 text-sm font-semibold tabular-nums ${
                  stat.tone === 'positive'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : stat.tone === 'negative'
                      ? 'text-rose-600 dark:text-rose-400'
                      : ''
                }`}
              >
                {formatMoney(stat.value, currency)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  )
}
