import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { Settings } from '@shared/types'
import { AuthScreen } from './components/AuthScreen'
import { Shell } from './components/Shell'
import { ToastProvider } from './components/Toast'
import { Spinner } from './components/ui'
import { api, type AuthStatus } from './lib/api'
import { LedgerProvider } from './state/LedgerProvider'
import { DashboardPage } from './pages/Dashboard'

// The dashboard is the screen that has to open instantly, so it is the only
// eagerly-imported route. Reports pulls in Recharts (~180 kB gzipped), which is
// not worth shipping to someone who only ever logs an expense.
const TransactionsPage = lazy(() =>
  import('./pages/Transactions').then((module) => ({ default: module.TransactionsPage })),
)
const ReportsPage = lazy(() =>
  import('./pages/Reports').then((module) => ({ default: module.ReportsPage })),
)
const CategoriesPage = lazy(() =>
  import('./pages/Categories').then((module) => ({ default: module.CategoriesPage })),
)
const SettingsPage = lazy(() =>
  import('./pages/Settings').then((module) => ({ default: module.SettingsPage })),
)
const SavingsPage = lazy(() =>
  import('./pages/Savings').then((module) => ({ default: module.SavingsPage })),
)
const AdminPage = lazy(() =>
  import('./pages/Admin').then((module) => ({ default: module.AdminPage })),
)

function RouteFallback() {
  return (
    <div className="flex justify-center py-16 text-slate-400">
      <Spinner className="h-6 w-6" />
    </div>
  )
}

export default function App() {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [booting, setBooting] = useState(true)

  const bootstrap = useCallback(async () => {
    setBooting(true)
    try {
      const next = await api.auth.status()
      setStatus(next)
      setSettings(next.authenticated ? await api.settings.get() : null)
    } catch {
      // Treat an unreachable API as "locked" rather than crashing the shell.
      setStatus({ configured: true, authenticated: false, is_admin: false, currency_symbol: '৳' })
      setSettings(null)
    } finally {
      setBooting(false)
    }
  }, [])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  // A 401 from any request (an expired 30-day cookie, for example) drops back to
  // the lock screen instead of leaving a half-rendered dashboard.
  useEffect(
    () =>
      api.onUnauthorized(() =>
        setStatus((current) => (current ? { ...current, authenticated: false } : current)),
      ),
    [],
  )

  const handleLogout = useCallback(async () => {
    await api.auth.logout().catch(() => undefined)
    setSettings(null)
    setStatus((current) => (current ? { ...current, authenticated: false } : current))
  }, [])

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (!status?.authenticated || !settings) {
    return (
      <ToastProvider>
        <AuthScreen
          // A brand-new install has no account yet, so sign-up leads. Once one
          // exists, sign-in leads and sign-up is one tap away beneath the button.
          initialMode={status?.configured ? 'login' : 'signup'}
          onSuccess={bootstrap}
        />
      </ToastProvider>
    )
  }

  return (
    <ToastProvider>
      <LedgerProvider initialSettings={settings}>
        <Shell>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/transactions" element={<TransactionsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/savings" element={<SavingsPage />} />
              <Route path="/categories" element={<CategoriesPage />} />
              <Route path="/settings" element={<SettingsPage onLogout={handleLogout} />} />
              {/* Registered before the catch-all; the API still 403s non-admins. */}
              <Route path="/admin" element={<AdminPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Shell>
      </LedgerProvider>
    </ToastProvider>
  )
}
