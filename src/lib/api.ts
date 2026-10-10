import type {
  AdminOverview,
  Budget,
  Bucket,
  Category,
  CategoryBreakdownItem,
  CategoryWithUsage,
  Insight,
  Paginated,
  SavingsMutationResult,
  SavingsState,
  Settings,
  Summary,
  TimeseriesPoint,
  Transaction,
  TransactionInput,
  TransactionQuery,
  TxType,
} from '@shared/types'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const BASE = import.meta.env.VITE_API_BASE ?? '/api'

const UNAUTHORIZED_EVENT = 'myledger:unauthorized'

function queryString(params?: object): string {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')

  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const payload: unknown = isJson ? await response.json() : null

  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with status ${response.status}`
    throw new ApiError(message, response.status, payload)
  }

  return payload as T
}

export interface AuthStatus {
  configured: boolean
  authenticated: boolean
  is_admin: boolean
  currency_symbol: string
}

export interface SummaryFilters {
  from?: string
  to?: string
}

export function buildTransactionQuery(query: TransactionQuery): Record<string, unknown> {
  return {
    from: query.from,
    to: query.to,
    type: query.type,
    category_id: query.category_id,
    search: query.search,
    limit: query.limit,
    offset: query.offset,
  }
}

export const api = {
  onUnauthorized(listener: () => void): () => void {
    window.addEventListener(UNAUTHORIZED_EVENT, listener)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, listener)
  },

  auth: {
    status: () => request<AuthStatus>('/auth/status'),
    signup: (username: string, password: string) =>
      request<{ ok: true }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    login: (username: string, password: string) =>
      request<{ ok: true }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  },

  transactions: {
    list: (query: TransactionQuery = {}) =>
      request<Paginated<Transaction>>(`/transactions${queryString(buildTransactionQuery(query))}`),
    create: (input: TransactionInput) =>
      request<Transaction>('/transactions', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: Partial<TransactionInput>) =>
      request<Transaction>(`/transactions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    remove: (id: number) =>
      request<{ ok: true; current_balance: number }>(`/transactions/${id}`, {
        method: 'DELETE',
      }),
  },

  categories: {
    list: (type?: TxType) =>
      request<{ items: CategoryWithUsage[] }>(`/categories${queryString({ type })}`),
    create: (input: { name: string; type: TxType; color: string; icon?: string | null }) =>
      request<Category>('/categories', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: { name?: string; color?: string; icon?: string | null }) =>
      request<Category>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    remove: (id: number, reassign: boolean) =>
      request<{ ok: true; reassigned?: number; reassigned_to?: string }>(
        `/categories/${id}${queryString({ reassign: reassign ? 'true' : undefined })}`,
        { method: 'DELETE' },
      ),
  },

  settings: {
    get: () => request<Settings>('/settings'),
    update: (input: { currency_symbol?: string; opening_balance?: number }) =>
      request<Settings>('/settings', { method: 'PATCH', body: JSON.stringify(input) }),
    recalculate: () => request<Settings>('/settings/recalculate', { method: 'POST' }),
    changePassword: (password: string) =>
      request<{ ok: true }>('/settings/password', {
        method: 'PUT',
        body: JSON.stringify({ password }),
      }),
  },

  reports: {
    summary: (query: SummaryFilters & { type?: TxType } = {}) =>
      request<Summary>(`/reports/summary${queryString(query)}`),
    byCategory: (query: SummaryFilters & { type?: TxType } = {}) =>
      request<{ grand_total: number; items: CategoryBreakdownItem[] }>(
        `/reports/by-category${queryString(query)}`,
      ),
    timeseries: (query: SummaryFilters & { bucket: Bucket; type?: TxType }) =>
      request<{ bucket: Bucket; items: TimeseriesPoint[] }>(
        `/reports/timeseries${queryString(query)}`,
      ),
    insights: (month?: string) =>
      request<{ month: string; currency_symbol: string; items: Insight[] }>(
        `/reports/insights${queryString({ month })}`,
      ),
  },

  budgets: {
    list: (month?: string) =>
      request<{ month: string; from: string; to: string; items: Budget[] }>(
        `/budgets${queryString({ month })}`,
      ),
    set: (categoryId: number, amount: number) =>
      request<{ ok: true }>(`/budgets/${categoryId}`, {
        method: 'PUT',
        body: JSON.stringify({ amount }),
      }),
    remove: (categoryId: number) =>
      request<{ ok: true }>(`/budgets/${categoryId}`, { method: 'DELETE' }),
  },

  /** Cookie-authenticated download link — safe to use as a plain anchor href. */
  exportUrl: (query: SummaryFilters & { type?: TxType } = {}) =>
    `${BASE}/export/csv${queryString(query)}`,

  savings: {
    get: () => request<SavingsState>('/savings'),
    deposit: (input: { amount: number; note?: string | null; date?: string }) =>
      request<SavingsMutationResult>('/savings/deposit', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    spend: (input: { amount: number; note?: string | null; date?: string }) =>
      request<SavingsMutationResult>('/savings/spend', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    remove: (id: number) =>
      request<SavingsMutationResult>(`/savings/${id}`, { method: 'DELETE' }),
  },

  admin: {
    /** 403s unless the signed-in account is an admin. */
    overview: () => request<AdminOverview>('/admin/overview'),
  },
}
