export type TxType = 'expense' | 'earning'

/** A movement in or out of the savings pot. */
export type SavingsKind = 'deposit' | 'spend'

export type Bucket = 'day' | 'week' | 'month' | 'year'

export interface Category {
  id: number
  name: string
  type: TxType
  color: string
  icon: string | null
  is_default: number
  created_at: string
}

export interface CategoryWithUsage extends Category {
  transaction_count: number
  total: number
}

export interface Transaction {
  id: number
  type: TxType
  amount: number
  category_id: number
  note: string | null
  date: string
  created_at: string
  category_name: string
  category_color: string
  category_icon: string | null
  /**
   * The History feed merges savings movements in with transactions. `savings`
   * rows are read-only here (no category, no edit) and carry `savings_kind`;
   * everything else is a normal ledger entry.
   */
  source?: 'transaction' | 'savings'
  savings_kind?: SavingsKind | null
}

export interface Settings {
  current_balance: number
  opening_balance: number
  /** Money set aside in the savings pot; see `SavingsEntry`. */
  savings_balance: number
  currency_symbol: string
  updated_at: string
}

export interface Summary {
  from: string | null
  to: string | null
  /** Transaction expenses plus savings spends — money that actually left. */
  total_expense: number
  total_earning: number
  net: number
  transaction_count: number
  current_balance: number
  savings_balance: number
  /** Saved into the pot over the window (a transfer, not spending). */
  savings_deposited: number
  /** Taken out of the pot and spent over the window. */
  savings_spent: number
  currency_symbol: string
}

export interface CategoryBreakdownItem {
  category_id: number
  category_name: string
  color: string
  icon: string | null
  total: number
  count: number
  share: number
}

export interface TimeseriesPoint {
  bucket: string
  label: string
  expense: number
  earning: number
  net: number
}

export interface Budget {
  id: number
  category_id: number
  category_name: string
  color: string
  icon: string | null
  amount: number
  spent: number
}

export interface Insight {
  kind: 'up' | 'down' | 'info'
  text: string
}

export interface TransactionInput {
  type: TxType
  amount: number
  category_id: number
  note?: string | null
  date?: string
}

export interface TransactionQuery {
  from?: string
  to?: string
  type?: TxType
  category_id?: number
  search?: string
  limit?: number
  offset?: number
}

export interface Paginated<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface SavingsEntry {
  id: number
  kind: SavingsKind
  amount: number
  note: string | null
  date: string
  created_at: string
}

export interface SavingsBalances {
  current_balance: number
  savings_balance: number
  currency_symbol: string
}

/** Payload for `GET /api/savings`. */
export interface SavingsState extends SavingsBalances {
  items: SavingsEntry[]
}

/** Returned by a deposit, a spend, or a delete — the two balances after the change. */
export interface SavingsMutationResult extends SavingsBalances {
  ok: true
}

/** Admin-only: one row per account in the fleet overview. */
export interface AdminUserRow {
  id: number
  username: string
  created_at: string
  transaction_count: number
  last_activity: string | null
}

/** Admin-only: usage snapshot returned by `GET /api/admin/overview`. */
export interface AdminOverview {
  total_users: number
  new_users_7d: number
  new_users_30d: number
  /** Accounts that logged at least one transaction in the last 7 days. */
  active_users_7d: number
  users: AdminUserRow[]
}
