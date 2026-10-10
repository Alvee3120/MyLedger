import { useEffect, useMemo, useState } from 'react'
import type { CategoryBreakdownItem, Insight, Summary, TimeseriesPoint, TxType } from '@shared/types'
import { CategoryDonut, CategoryLegend, TrendChart } from '../components/Charts'
import {
  DownloadIcon,
  InfoIcon,
  SavingsIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from '../components/Icons'
import { EmptyState, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { TREND_PRESETS, monthKey, trendRange, trendWindowLabel, type TrendPreset } from '../lib/dates'
import { formatMoney } from '../lib/format'
import { useLedger } from '../state/LedgerProvider'

const PRESET_ORDER: TrendPreset[] = ['day', 'week', 'month', 'year']

const INSIGHT_ICON = {
  up: TrendingUpIcon,
  down: TrendingDownIcon,
  info: InfoIcon,
} as const

const INSIGHT_TONE = {
  up: 'text-rose-600 dark:text-rose-400',
  down: 'text-emerald-600 dark:text-emerald-400',
  info: 'text-slate-500 dark:text-slate-400',
} as const

function SummaryStrip({ summary, currency }: { summary: Summary | null; currency: string }) {
  const cells = [
    {
      label: 'Spent',
      value: summary?.total_expense ?? 0,
      tone: 'text-rose-600 dark:text-rose-400',
    },
    {
      label: 'Earned',
      value: summary?.total_earning ?? 0,
      tone: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Net',
      value: summary?.net ?? 0,
      tone:
        (summary?.net ?? 0) >= 0
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-rose-600 dark:text-rose-400',
    },
  ]

  return (
    <dl className="card grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800">
      {cells.map((cell) => (
        <div key={cell.label} className="px-3 py-4 text-center">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {cell.label}
          </dt>
          <dd className={`mt-1 text-base font-bold tabular-nums ${cell.tone}`}>
            {formatMoney(cell.value, currency)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function SavingsStrip({ summary, currency }: { summary: Summary | null; currency: string }) {
  const cells = [
    { label: 'Saved', value: summary?.savings_deposited ?? 0 },
    { label: 'Spent from savings', value: summary?.savings_spent ?? 0 },
  ]

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <SavingsIcon className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          Savings
        </h2>
        <span className="text-sm font-bold tabular-nums text-brand-600 dark:text-brand-400">
          {formatMoney(summary?.savings_balance ?? 0, currency)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {cells.map((cell) => (
          <div key={cell.label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {cell.label}
            </p>
            <p className="mt-0.5 font-semibold tabular-nums">{formatMoney(cell.value, currency)}</p>
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Spending from savings counts towards “Spent” above; moving money into savings is a transfer.
      </p>
    </section>
  )
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
}) {
  return (
    <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
            value === option.value
              ? 'bg-white shadow-sm dark:bg-slate-700'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function ReportsPage() {
  const { currency } = useLedger()

  const [preset, setPreset] = useState<TrendPreset>('month')
  const [breakdownType, setBreakdownType] = useState<TxType>('expense')
  const [variant, setVariant] = useState<'bar' | 'line'>('bar')

  const [summary, setSummary] = useState<Summary | null>(null)
  const [breakdown, setBreakdown] = useState<CategoryBreakdownItem[]>([])
  const [series, setSeries] = useState<TimeseriesPoint[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)

  const range = useMemo(() => trendRange(preset), [preset])
  const bucket = TREND_PRESETS[preset].bucket

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    void (async () => {
      try {
        const [summaryResult, breakdownResult, seriesResult, insightResult] = await Promise.all([
          api.reports.summary(range),
          api.reports.byCategory({ ...range, type: breakdownType }),
          api.reports.timeseries({ ...range, bucket }),
          api.reports.insights(monthKey()),
        ])
        if (cancelled) return
        setSummary(summaryResult)
        setBreakdown(breakdownResult.items)
        setSeries(seriesResult.items)
        setInsights(insightResult.items)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [range, bucket, breakdownType])

  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-4">
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {PRESET_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={preset === option}
              onClick={() => setPreset(option)}
              className={`rounded-lg py-2 text-xs font-semibold transition ${
                preset === option
                  ? 'bg-white shadow-sm dark:bg-slate-700'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {TREND_PRESETS[option].label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {trendWindowLabel(preset)} · grouped by {bucket}
          </p>
          <a href={api.exportUrl(range)} download className="btn-ghost px-3 py-1.5 text-xs">
            <DownloadIcon className="h-3.5 w-3.5" />
            CSV
          </a>
        </div>
      </section>

      <SummaryStrip summary={summary} currency={currency} />

      <SavingsStrip summary={summary} currency={currency} />

      {insights.length > 0 ? (
        <section className="card divide-y divide-slate-100 dark:divide-slate-800">
          {insights.map((insight, index) => {
            const Icon = INSIGHT_ICON[insight.kind]
            return (
              <div key={index} className="flex items-start gap-3 px-4 py-3">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${INSIGHT_TONE[insight.kind]}`} />
                <p className="text-sm text-slate-600 dark:text-slate-300">{insight.text}</p>
              </div>
            )
          })}
        </section>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <>
          <section className="card p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">By category</h2>
              <div className="w-44">
                <SegmentedControl
                  value={breakdownType}
                  onChange={setBreakdownType}
                  options={[
                    { value: 'expense', label: 'Expense' },
                    { value: 'earning', label: 'Earning' },
                  ]}
                />
              </div>
            </div>

            {breakdown.length === 0 ? (
              <EmptyState
                title={`No ${breakdownType === 'expense' ? 'spending' : 'earnings'} in this period`}
                description="Try a wider time range."
              />
            ) : (
              <>
                <CategoryDonut data={breakdown} currency={currency} />
                <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800">
                  <CategoryLegend data={breakdown} currency={currency} />
                </div>
              </>
            )}
          </section>

          <section className="card p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Over time</h2>
              <div className="w-32">
                <SegmentedControl
                  value={variant}
                  onChange={setVariant}
                  options={[
                    { value: 'bar', label: 'Bar' },
                    { value: 'line', label: 'Line' },
                  ]}
                />
              </div>
            </div>

            {series.length === 0 ? (
              <EmptyState title="Nothing to chart yet" description="Log a few transactions first." />
            ) : (
              <>
                <TrendChart
                  data={series}
                  bucket={bucket}
                  currency={currency}
                  variant={variant}
                  type={breakdownType}
                />
                <div className="mt-2 flex justify-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                  {breakdownType !== 'earning' ? (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      Expense
                    </span>
                  ) : null}
                  {breakdownType !== 'expense' ? (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Earning
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
