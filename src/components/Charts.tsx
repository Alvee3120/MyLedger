import type { CategoryBreakdownItem, TimeseriesPoint, Bucket } from '@shared/types'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatBucket } from '../lib/dates'
import { formatMoney } from '../lib/format'

const EXPENSE_COLOR = '#f43f5e'
const EARNING_COLOR = '#10b981'
const AXIS_COLOR = '#94a3b8'

interface TooltipEntry {
  name?: string
  value?: number | string
  color?: string
  payload?: Record<string, unknown>
}

function TooltipCard({ title, rows }: { title: string; rows: { label: string; value: string; color: string }[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
      <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="flex items-center gap-2 text-sm font-medium">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
          <span className="text-slate-600 dark:text-slate-300">{row.label}</span>
          <span className="tabular-nums">{row.value}</span>
        </p>
      ))}
    </div>
  )
}

export function CategoryDonut({
  data,
  currency,
}: {
  data: CategoryBreakdownItem[]
  currency: string
}) {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="total"
            nameKey="category_name"
            innerRadius={62}
            outerRadius={98}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((item) => (
              <Cell key={item.category_id} fill={item.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const entry = payload[0] as TooltipEntry
              const item = entry.payload as unknown as CategoryBreakdownItem
              return (
                <TooltipCard
                  title={item.category_name}
                  rows={[
                    { label: 'Total', value: formatMoney(item.total, currency), color: item.color },
                    { label: 'Share', value: `${item.share}%`, color: AXIS_COLOR },
                  ]}
                />
              )
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs uppercase tracking-wide text-slate-400">Total</span>
        <span className="text-lg font-bold tabular-nums">
          {formatMoney(
            data.reduce((sum, item) => sum + item.total, 0),
            currency,
          )}
        </span>
      </div>
    </div>
  )
}

export function CategoryLegend({
  data,
  currency,
}: {
  data: CategoryBreakdownItem[]
  currency: string
}) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {data.map((item) => (
        <li key={item.category_id} className="flex items-center gap-3 py-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <span className="min-w-0 flex-1 truncate text-sm">
            {item.icon ? <span className="mr-1">{item.icon}</span> : null}
            {item.category_name}
          </span>
          <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {item.share}%
          </span>
          <span className="w-20 text-right text-sm font-semibold tabular-nums">
            {formatMoney(item.total, currency)}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function TrendChart({
  data,
  bucket,
  currency,
  variant,
  type,
}: {
  data: TimeseriesPoint[]
  bucket: Bucket
  currency: string
  variant: 'bar' | 'line'
  /** When set, only that series is drawn — useful for a focused expense view. */
  type?: 'expense' | 'earning'
}) {
  const chartData = data.map((point) => ({
    ...point,
    label: formatBucket(point.bucket, bucket),
  }))

  const renderTooltip = ({ active, payload, label }: {
    active?: boolean
    payload?: TooltipEntry[]
    label?: string | number
  }) => {
    if (!active || !payload?.length) return null
    return (
      <TooltipCard
        title={String(label ?? '')}
        rows={payload.map((entry) => ({
          label: entry.name ?? '',
          value: formatMoney(Number(entry.value ?? 0), currency),
          color: entry.color ?? AXIS_COLOR,
        }))}
      />
    )
  }

  const commonProps = {
    data: chartData,
    margin: { top: 8, right: 8, bottom: 0, left: -18 },
  }

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" vertical={false} />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 11, fill: AXIS_COLOR }}
        tickLine={false}
        axisLine={false}
        interval="preserveStartEnd"
        minTickGap={16}
      />
      <YAxis
        tick={{ fontSize: 11, fill: AXIS_COLOR }}
        tickLine={false}
        axisLine={false}
        width={56}
        tickFormatter={(value: number) => (Math.abs(value) >= 1000 ? `${Math.round(value / 1000)}k` : String(value))}
      />
    </>
  )

  return (
    <ResponsiveContainer width="100%" height={240}>
      {variant === 'bar' ? (
        <BarChart {...commonProps} barGap={2}>
          {axes}
          <Tooltip cursor={{ fill: 'rgba(148, 163, 184, 0.14)' }} content={renderTooltip} />
          {type !== 'earning' ? (
            <Bar dataKey="expense" name="Expense" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={34} />
          ) : null}
          {type !== 'expense' ? (
            <Bar dataKey="earning" name="Earning" fill={EARNING_COLOR} radius={[4, 4, 0, 0]} maxBarSize={34} />
          ) : null}
        </BarChart>
      ) : (
        <LineChart {...commonProps}>
          {axes}
          <Tooltip content={renderTooltip} />
          {type !== 'earning' ? (
            <Line
              type="monotone"
              dataKey="expense"
              name="Expense"
              stroke={EXPENSE_COLOR}
              strokeWidth={2.5}
              dot={false}
            />
          ) : null}
          {type !== 'expense' ? (
            <Line
              type="monotone"
              dataKey="earning"
              name="Earning"
              stroke={EARNING_COLOR}
              strokeWidth={2.5}
              dot={false}
            />
          ) : null}
        </LineChart>
      )}
    </ResponsiveContainer>
  )
}
