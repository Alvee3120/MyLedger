import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useTheme } from '../lib/theme'
import {
  ChartIcon,
  CogIcon,
  HomeIcon,
  ListIcon,
  MoonIcon,
  SavingsIcon,
  SunIcon,
  TagIcon,
  WalletIcon,
} from './Icons'

const NAV_ITEMS = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/transactions', label: 'History', Icon: ListIcon, end: false },
  { to: '/savings', label: 'Savings', Icon: SavingsIcon, end: false },
  { to: '/reports', label: 'Reports', Icon: ChartIcon, end: false },
  { to: '/categories', label: 'Categories', Icon: TagIcon, end: false },
  { to: '/settings', label: 'Settings', Icon: CogIcon, end: false },
]

export function Shell({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme()

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-slate-50/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 text-white">
              <WalletIcon className="h-4 w-4" />
            </span>
            <span className="font-bold tracking-tight">MyLedger</span>
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">{children}</main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex w-full max-w-2xl">
          {NAV_ITEMS.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                  isActive
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
