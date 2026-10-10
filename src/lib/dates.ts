import type { Bucket } from '@shared/types'

export type RangePreset = 'day' | 'week' | 'month' | 'year' | 'all' | 'custom'

export interface DateRange {
  from: string
  to: string
}

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Parses `YYYY-MM-DD` as a local calendar date, avoiding a UTC shift. */
export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function isValidISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseISODate(value).getTime())
}

/** Monday-first start of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const clone = new Date(date)
  const offset = (clone.getDay() + 6) % 7
  clone.setDate(clone.getDate() - offset)
  return clone
}

export function rangeFor(preset: Exclude<RangePreset, 'custom'>, anchor = new Date()): DateRange | null {
  switch (preset) {
    case 'day':
      return { from: toISODate(anchor), to: toISODate(anchor) }
    case 'week': {
      const start = startOfWeek(anchor)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      return { from: toISODate(start), to: toISODate(end) }
    }
    case 'month':
      return {
        from: toISODate(new Date(anchor.getFullYear(), anchor.getMonth(), 1)),
        to: toISODate(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)),
      }
    case 'year':
      return { from: `${anchor.getFullYear()}-01-01`, to: `${anchor.getFullYear()}-12-31` }
    case 'all':
    default:
      return null
  }
}

const dayFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const weekdayFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const monthFormatter = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' })
const fullFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** "Today" / "Yesterday" / "Tue, 8 Sep 2026" — used as the history group headers. */
export function formatDateGroup(iso: string): string {
  const today = todayISO()
  if (iso === today) return 'Today'

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (iso === toISODate(yesterday)) return 'Yesterday'

  return weekdayFormatter.format(parseISODate(iso))
}

export function formatFullDate(iso: string): string {
  return fullFormatter.format(parseISODate(iso))
}

/** Short axis/tooltip label for a bucketed time-series point. */
export function formatBucket(iso: string, bucket: Bucket): string {
  if (!isValidISODate(iso)) return iso
  const date = parseISODate(iso)
  switch (bucket) {
    case 'day':
      return dayFormatter.format(date)
    case 'week':
      return `w/c ${dayFormatter.format(date)}`
    case 'month':
      return monthFormatter.format(date)
    case 'year':
      return String(date.getFullYear())
  }
}

export function formatRangeLabel(range: DateRange | null): string {
  if (!range) return 'All time'
  if (range.from === range.to) return fullFormatter.format(parseISODate(range.from))
  return `${dayFormatter.format(parseISODate(range.from))} – ${fullFormatter.format(parseISODate(range.to))}`
}

/** `YYYY-MM` for the month containing `date`, used by budgets and insights. */
export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

export type TrendPreset = 'day' | 'week' | 'month' | 'year'

export interface TrendPresetConfig {
  label: string
  /** Trailing window the preset covers, e.g. 30 days of day-buckets. */
  window: number
  bucket: Bucket
}

/**
 * The trend presets pair a bucket size with a trailing window wide enough to be
 * worth charting — a one-day range would always render a single bar.
 */
export const TREND_PRESETS: Record<TrendPreset, TrendPresetConfig> = {
  day: { label: 'Day', window: 30, bucket: 'day' },
  week: { label: 'Week', window: 12, bucket: 'week' },
  month: { label: 'Month', window: 12, bucket: 'month' },
  year: { label: 'Year', window: 5, bucket: 'year' },
}

export function trendRange(preset: TrendPreset, anchor = new Date()): DateRange {
  const start = new Date(anchor)
  const end = new Date(anchor)

  switch (preset) {
    case 'day':
      start.setDate(start.getDate() - (TREND_PRESETS.day.window - 1))
      break
    case 'week': {
      const weekStart = startOfWeek(anchor)
      start.setTime(weekStart.getTime())
      start.setDate(start.getDate() - (TREND_PRESETS.week.window - 1) * 7)
      end.setTime(weekStart.getTime())
      end.setDate(end.getDate() + 6)
      break
    }
    case 'month': {
      start.setDate(1)
      start.setMonth(start.getMonth() - (TREND_PRESETS.month.window - 1))
      end.setMonth(end.getMonth() + 1, 0)
      break
    }
    case 'year': {
      start.setMonth(0, 1)
      start.setFullYear(start.getFullYear() - (TREND_PRESETS.year.window - 1))
      end.setMonth(11, 31)
      break
    }
  }

  return { from: toISODate(start), to: toISODate(end) }
}

/** Human summary of a preset window, e.g. "Last 30 days" / "Last 12 months". */
export function trendWindowLabel(preset: TrendPreset): string {
  const { window, bucket } = TREND_PRESETS[preset]
  return `Last ${window} ${bucket}${window === 1 ? '' : 's'}`
}
