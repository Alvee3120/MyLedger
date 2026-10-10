import { useEffect, useState, type FormEvent } from 'react'
import { DownloadIcon, LockIcon, LogoutIcon, MoonIcon, SunIcon } from '../components/Icons'
import { useToast } from '../components/Toast'
import { Spinner } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { useTheme } from '../lib/theme'
import { formatMoney } from '../lib/format'
import { useLedger } from '../state/LedgerProvider'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function SettingsPage({ onLogout }: { onLogout: () => Promise<void> }) {
  const { settings, currency, reloadSettings } = useLedger()
  const { notify } = useToast()
  const { theme, toggle } = useTheme()

  const [symbol, setSymbol] = useState(settings.currency_symbol)
  const [opening, setOpening] = useState(String(settings.opening_balance))
  const [savingLedger, setSavingLedger] = useState(false)
  const [recalculating, setRecalculating] = useState(false)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')

  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleLedgerSave(event: FormEvent) {
    event.preventDefault()
    setSavingLedger(true)
    try {
      const parsedOpening = Number(opening)
      const next = await api.settings.update({
        currency_symbol: symbol.trim() || '৳',
        opening_balance: Number.isFinite(parsedOpening) ? parsedOpening : 0,
      })
      await reloadSettings()
      notify(`Balance now ${formatMoney(next.current_balance, next.currency_symbol)}`, 'success')
    } catch (caught) {
      notify(caught instanceof ApiError ? caught.message : 'Could not save settings', 'error')
    } finally {
      setSavingLedger(false)
    }
  }

  async function handleRecalculate() {
    setRecalculating(true)
    try {
      const next = await api.settings.recalculate()
      await reloadSettings()
      setOpening(String(next.opening_balance))
      notify('Balance rebuilt from the transaction log', 'success')
    } finally {
      setRecalculating(false)
    }
  }

  async function handlePasswordChange(event: FormEvent) {
    event.preventDefault()
    if (password.length < 4) {
      notify('Use at least 4 characters', 'error')
      return
    }
    if (password !== confirm) {
      notify('The two passwords do not match', 'error')
      return
    }

    setSavingPassword(true)
    try {
      await api.settings.changePassword(password)
      setPassword('')
      setConfirm('')
      notify('Password updated', 'success')
    } catch (caught) {
      notify(caught instanceof ApiError ? caught.message : 'Could not update password', 'error')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Ledger</h2>
        <form onSubmit={handleLedgerSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="currency">
                Currency symbol
              </label>
              <input
                id="currency"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
                maxLength={4}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="opening">
                Opening balance
              </label>
              <input
                id="opening"
                value={opening}
                onChange={(event) => setOpening(event.target.value.replace(/[^0-9.-]/g, ''))}
                inputMode="decimal"
                className="input"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            The opening balance is the money you already had before you started logging. The
            balance above it is <strong>{formatMoney(settings.current_balance, currency)}</strong>,
            kept in sync by database triggers on every entry.
          </p>
          <button type="submit" className="btn-primary w-full" disabled={savingLedger}>
            {savingLedger ? <Spinner className="h-4 w-4" /> : null}
            Save
          </button>
        </form>

        <button
          type="button"
          onClick={() => void handleRecalculate()}
          disabled={recalculating}
          className="btn-ghost mt-2 w-full"
        >
          {recalculating ? <Spinner className="h-4 w-4" /> : null}
          Recalculate balance
        </button>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Export</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="export-from">
              From
            </label>
            <input
              id="export-from"
              type="date"
              value={exportFrom}
              onChange={(event) => setExportFrom(event.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="export-to">
              To
            </label>
            <input
              id="export-to"
              type="date"
              value={exportTo}
              onChange={(event) => setExportTo(event.target.value)}
              className="input"
            />
          </div>
        </div>
        <a
          href={api.exportUrl({ from: exportFrom || undefined, to: exportTo || undefined })}
          download
          className="btn-primary mt-3 w-full"
        >
          <DownloadIcon className="h-4 w-4" />
          Download CSV
        </a>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Leave both dates empty to export everything.
        </p>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <LockIcon className="h-4 w-4" />
          Security
        </h2>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          <div>
            <label className="label" htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
              className="input"
              placeholder="At least 4 characters"
            />
          </div>
          <div>
            <label className="label" htmlFor="confirm-password">
              Confirm
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirm}
              autoComplete="new-password"
              onChange={(event) => setConfirm(event.target.value)}
              className="input"
            />
          </div>
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={savingPassword || !password}
          >
            {savingPassword ? <Spinner className="h-4 w-4" /> : null}
            Update password
          </button>
        </form>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">App</h2>
        <button type="button" onClick={toggle} className="btn-ghost w-full justify-between">
          <span>Appearance</span>
          <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            {theme === 'dark' ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />}
            {theme === 'dark' ? 'Dark' : 'Light'}
          </span>
        </button>

        {installEvent ? (
          <button
            type="button"
            className="btn-ghost mt-2 w-full justify-between"
            onClick={() => {
              void installEvent.prompt()
              setInstallEvent(null)
            }}
          >
            <span>Install on this device</span>
            <span className="text-slate-500 dark:text-slate-400">Add to home screen</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => void onLogout()}
          className="btn-ghost mt-2 w-full justify-between text-rose-600 dark:text-rose-400"
        >
          <span>Sign out</span>
          <LogoutIcon className="h-4 w-4" />
        </button>
      </section>

      <p className="px-2 pb-2 text-center text-xs text-slate-400 dark:text-slate-600">
        MyLedger · self-hosted on Cloudflare Pages, Workers and D1
      </p>
    </div>
  )
}
