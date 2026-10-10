/** Money is rounded to 2 decimals at every write and in every aggregate. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** `YYYY-MM-DD` from a Date, using the date's *local* calendar day. */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Minimal RFC 4180 CSV field escaping, plus a guard against spreadsheet formula injection. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCSV(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n')
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.trunc(n), min), max)
}

export interface MonthBounds {
  /** First day of the target month. */
  start: string
  /** Last day of the target month. */
  end: string
  /** First day of the preceding month. */
  prevStart: string
  /** `YYYY-MM` of the target month. */
  month: string
}

/**
 * Resolves `YYYY-MM` (or the current UTC month when omitted) into the inclusive
 * date bounds used by the budget and insight queries.
 */
export function monthBounds(month?: string): MonthBounds {
  const now = new Date()
  let year = now.getUTCFullYear()
  let monthNumber = now.getUTCMonth() + 1

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    year = Number(month.slice(0, 4))
    monthNumber = Number(month.slice(5, 7))
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const prevMonthNumber = monthNumber === 1 ? 12 : monthNumber - 1
  const prevYear = monthNumber === 1 ? year - 1 : year

  return {
    month: `${year}-${pad(monthNumber)}`,
    start: `${year}-${pad(monthNumber)}-01`,
    end: `${year}-${pad(monthNumber)}-${pad(lastDay)}`,
    prevStart: `${prevYear}-${pad(prevMonthNumber)}-01`,
  }
}
