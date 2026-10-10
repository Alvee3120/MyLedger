export function formatMoney(amount: number, symbol = '৳'): string {
  const sign = amount < 0 ? '-' : ''
  const value = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  return `${sign}${symbol}${value}`
}

/** Tailwind text colour for a balance: green in credit, red in the red. */
export function balanceTone(amount: number): string {
  if (amount > 0) return 'text-emerald-600 dark:text-emerald-400'
  if (amount < 0) return 'text-rose-600 dark:text-rose-400'
  return 'text-slate-500 dark:text-slate-400'
}

/** Picks a readable text colour (black or white) for a coloured chip. */
export function contrastText(hex: string): string {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) return '#ffffff'
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#0f172a' : '#ffffff'
}
