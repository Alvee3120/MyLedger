import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import type { AppBindings } from '../env'

export const SESSION_COOKIE = 'ml_session'

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_KEY_BYTES = 32
const MAX_FAILED_ATTEMPTS = 10
const LOCKOUT_MINUTES = 15

/**
 * Verified against when the username does not exist, so a missing account costs
 * the same PBKDF2 work as a wrong password. Without this, response time alone
 * would reveal which usernames are registered.
 */
const ABSENT_USER: PasswordRecord = {
  hash: '0'.repeat(PBKDF2_KEY_BYTES * 2),
  salt: '0'.repeat(16 * 2),
  iterations: PBKDF2_ITERATIONS,
}

function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/** Length-independent, value-constant-time comparison. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    key,
    PBKDF2_KEY_BYTES * 8,
  )
  return new Uint8Array(bits)
}

export interface PasswordRecord {
  hash: string
  salt: string
  iterations: number
}

export async function hashPassword(password: string): Promise<PasswordRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derived = await derive(password, salt, PBKDF2_ITERATIONS)
  return {
    hash: bytesToHex(derived),
    salt: bytesToHex(salt),
    iterations: PBKDF2_ITERATIONS,
  }
}

export async function verifyPassword(
  password: string,
  record: PasswordRecord,
): Promise<boolean> {
  const derived = await derive(password, hexToBytes(record.salt), record.iterations)
  return timingSafeEqual(derived, hexToBytes(record.hash))
}

/** Burns the same hashing work as a real check, for an unknown username. */
export async function verifyAgainstAbsentUser(password: string): Promise<void> {
  await verifyPassword(password, ABSENT_USER)
}

export interface UserRow {
  id: number
  username: string
  password_hash: string
  password_salt: string
  password_iterations: number
}

export async function findUserByUsername(
  db: D1Database,
  username: string,
): Promise<UserRow | null> {
  const row = await db
    .prepare(
      `SELECT id, username, password_hash, password_salt, password_iterations
         FROM users WHERE username = ?`,
    )
    .bind(username)
    .first<UserRow>()
  return row ?? null
}

export async function countUsers(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS total FROM users').first<{ total: number }>()
  return row?.total ?? 0
}

/** The session subject is the account id, so one cookie authenticates one user. */
export async function issueSession(userId: number, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return sign(
    { sub: String(userId), iat: now, exp: now + SESSION_TTL_SECONDS },
    secret,
    'HS256',
  )
}

/** Returns the account id, or null when the token is missing, expired or forged. */
export async function readSession(token: string, secret: string): Promise<number | null> {
  try {
    const payload = await verify(token, secret, 'HS256')
    const id = Number(payload.sub)
    return Number.isInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

/**
 * `Secure` is derived from the request protocol rather than hard-coded so the
 * cookie still works over plain http on localhost during `wrangler pages dev`.
 * Deployed over https it is always set.
 */
function cookieOptions(c: Context) {
  return {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax' as const,
    path: '/',
  }
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    ...cookieOptions(c),
    maxAge: SESSION_TTL_SECONDS,
  })
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, cookieOptions(c))
}

/**
 * Gate for every route other than `/api/auth/*`. Resolves the cookie to an
 * account id and puts it on the context; routes must scope by it.
 */
export const requireAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  const userId = token ? await readSession(token, c.env.AUTH_SECRET) : null
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  c.set('userId', userId)
  await next()
}

/**
 * Admins are named by the `ADMIN_USERNAMES` allowlist. With no list configured
 * the owner — the very first account, id 1 — is the admin, so a fresh deploy
 * has a working dashboard without any extra configuration.
 */
export async function isAdminUser(
  db: D1Database,
  userId: number,
  allowlist?: string,
): Promise<boolean> {
  const configured = (allowlist ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)

  if (configured.length === 0) return userId === 1

  const row = await db
    .prepare('SELECT username FROM users WHERE id = ?')
    .bind(userId)
    .first<{ username: string }>()
  return row ? configured.includes(row.username.toLowerCase()) : false
}

/** Gate for `/api/admin/*`. Runs after `requireAuth`, so `userId` is always set. */
export const requireAdmin: MiddlewareHandler<AppBindings> = async (c, next) => {
  if (!(await isAdminUser(c.env.DB, c.get('userId'), c.env.ADMIN_USERNAMES))) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  await next()
}

export interface LockoutState {
  locked: boolean
  retryAfterSeconds: number
}

/** Lockout is tracked per account, so one user cannot lock out another. */
export async function checkLockout(db: D1Database, userId: number): Promise<LockoutState> {
  const row = await db
    .prepare('SELECT locked_until FROM users WHERE id = ?')
    .bind(userId)
    .first<{ locked_until: string | null }>()
  if (!row?.locked_until) return { locked: false, retryAfterSeconds: 0 }

  const until = new Date(row.locked_until.replace(' ', 'T') + 'Z').getTime()
  const remaining = until - Date.now()
  if (remaining <= 0) return { locked: false, retryAfterSeconds: 0 }
  return { locked: true, retryAfterSeconds: Math.ceil(remaining / 1000) }
}

export async function registerFailedAttempt(db: D1Database, userId: number): Promise<void> {
  // A lock that has already expired resets the counter so the next failure
  // starts a fresh window instead of instantly re-locking. Every SET expression
  // below reads the *pre-update* row (SQLite evaluates them against the original
  // values), so the "is this lock still live?" test has to be repeated in the
  // locked_until branch — reusing `failed_attempts + 1` there would see the old,
  // already-exhausted counter and re-lock on a single guess.
  await db
    .prepare(
      `UPDATE users
          SET failed_attempts = CASE
                WHEN locked_until IS NOT NULL AND locked_until <= datetime('now') THEN 1
                ELSE failed_attempts + 1
              END,
              locked_until = CASE
                WHEN locked_until IS NOT NULL AND locked_until <= datetime('now') THEN NULL
                WHEN failed_attempts + 1 >= ?1 THEN datetime('now', '+' || ?2 || ' minutes')
                ELSE NULL
              END
        WHERE id = ?3`,
    )
    .bind(MAX_FAILED_ATTEMPTS, LOCKOUT_MINUTES, userId)
    .run()
}

export async function clearFailedAttempts(db: D1Database, userId: number): Promise<void> {
  await db
    .prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?')
    .bind(userId)
    .run()
}
