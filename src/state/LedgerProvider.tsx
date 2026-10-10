import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { CategoryWithUsage, Settings } from '@shared/types'
import { api } from '../lib/api'

interface LedgerContextValue {
  settings: Settings
  categories: CategoryWithUsage[]
  expenseCategories: CategoryWithUsage[]
  earningCategories: CategoryWithUsage[]
  currency: string
  reloadSettings: () => Promise<void>
  reloadCategories: () => Promise<void>
}

const LedgerContext = createContext<LedgerContextValue | null>(null)

export function LedgerProvider({
  initialSettings,
  children,
}: {
  initialSettings: Settings
  children: ReactNode
}) {
  const [settings, setSettings] = useState<Settings>(initialSettings)
  const [categories, setCategories] = useState<CategoryWithUsage[]>([])

  const reloadSettings = useCallback(async () => {
    setSettings(await api.settings.get())
  }, [])

  const reloadCategories = useCallback(async () => {
    const { items } = await api.categories.list()
    setCategories(items)
  }, [])

  useEffect(() => {
    void reloadCategories()
  }, [reloadCategories])

  const value = useMemo<LedgerContextValue>(
    () => ({
      settings,
      categories,
      expenseCategories: categories.filter((category) => category.type === 'expense'),
      earningCategories: categories.filter((category) => category.type === 'earning'),
      currency: settings.currency_symbol,
      reloadSettings,
      reloadCategories,
    }),
    [settings, categories, reloadSettings, reloadCategories],
  )

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}

export function useLedger(): LedgerContextValue {
  const context = useContext(LedgerContext)
  if (!context) throw new Error('useLedger must be used inside <LedgerProvider>')
  return context
}
