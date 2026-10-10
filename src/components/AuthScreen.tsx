import { useId, useState, type FormEvent } from 'react'
import { api, ApiError } from '../lib/api'
import { EyeIcon, EyeOffIcon, LockIcon } from './Icons'
import { Spinner } from './ui'

/** Mirrors the server-side rule in worker/lib/validation.ts. */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/

const USERNAME_HINT = '3-32 characters: letters, numbers, and . _ -'

export type AuthMode = 'signup' | 'login'

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  autoComplete: string
  placeholder: string
  autoFocus?: boolean
}) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  // Named per field so two password boxes do not produce two identical
  // "Show password" buttons for screen reader users.
  const toggleLabel = `${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          className="input pr-12"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={toggleLabel}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-slate-400 transition hover:text-slate-600 focus-visible:text-brand-600 dark:hover:text-slate-200"
        >
          {visible ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
        </button>
      </div>
    </div>
  )
}

export function AuthScreen({
  initialMode,
  onSuccess,
}: {
  initialMode: AuthMode
  onSuccess: () => Promise<void> | void
}) {
  const usernameId = useId()
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const isSignup = mode === 'signup'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // The field shows exactly what was typed; the value sent to the server is
  // trimmed and lower-cased, because usernames are matched case-insensitively.
  const normalizedUsername = username.trim().toLowerCase()
  const usernameOk = USERNAME_PATTERN.test(normalizedUsername)
  const passwordsMatch = password === confirm

  const canSubmit = isSignup
    ? usernameOk && password.length >= 4 && confirm.length > 0 && !busy
    : normalizedUsername.length > 0 && password.length > 0 && !busy

  function switchMode(next: AuthMode) {
    setMode(next)
    setError(null)
    // Keep the username so switching between the two screens does not make
    // the user retype it; passwords are always re-entered.
    setPassword('')
    setConfirm('')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    // Backstop for the disabled-button state, which cannot explain itself.
    if (isSignup) {
      if (!usernameOk) {
        setError(`Username needs ${USERNAME_HINT}`)
        return
      }
      if (password.length < 4) {
        setError('Use at least 4 characters for the password.')
        return
      }
      if (!passwordsMatch) {
        setError('The two passwords do not match.')
        return
      }
    }

    setBusy(true)
    try {
      if (isSignup) await api.auth.signup(normalizedUsername, password)
      else await api.auth.login(normalizedUsername, password)
      await onSuccess()
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.',
      )
      // Keep the username so a typo in the password is a one-field retry.
      setPassword('')
      setConfirm('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-white">
            <LockIcon className="h-7 w-7" />
          </span>
          <h1 className="text-xl font-bold tracking-tight">MyLedger</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isSignup ? 'Create your account to get started.' : 'Sign in to continue.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-5" noValidate>
          <div>
            <label className="label" htmlFor={usernameId}>
              Username
            </label>
            <input
              id={usernameId}
              value={username}
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => setUsername(event.target.value)}
              className="input"
              placeholder={isSignup ? 'e.g. alvee' : 'your username'}
              aria-describedby={isSignup ? `${usernameId}-hint` : undefined}
            />
            {isSignup ? (
              <p
                id={`${usernameId}-hint`}
                className="mt-1.5 text-xs text-slate-500 dark:text-slate-400"
              >
                {USERNAME_HINT}
              </p>
            ) : null}
          </div>

          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            placeholder={isSignup ? 'At least 4 characters' : '••••••'}
          />

          {isSignup ? (
            <PasswordField
              label="Confirm password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              placeholder="Repeat it"
            />
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
            >
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn-primary w-full py-3" disabled={!canSubmit}>
            {busy ? <Spinner className="h-4 w-4" /> : null}
            {isSignup ? 'Create account' : 'Sign in'}
          </button>

          {isSignup ? (
            confirm.length > 0 && !passwordsMatch ? (
              <p className="text-center text-xs font-medium text-rose-600 dark:text-rose-400">
                The two passwords do not match.
              </p>
            ) : (
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                You will get your own private ledger. Your password is stored as a salted PBKDF2
                hash.
              </p>
            )
          ) : null}

          <p className="border-t border-slate-100 pt-4 text-center text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => switchMode(isSignup ? 'login' : 'signup')}
              className="font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
            >
              {isSignup ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
