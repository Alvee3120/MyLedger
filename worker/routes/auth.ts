import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import type { AppBindings } from '../env'
import {
  SESSION_COOKIE,
  checkLockout,
  clearFailedAttempts,
  clearSessionCookie,
  countUsers,
  findUserByUsername,
  hashPassword,
  isAdminUser,
  issueSession,
  readSession,
  registerFailedAttempt,
  setSessionCookie,
  verifyAgainstAbsentUser,
  verifyPassword,
} from '../lib/auth'
import { seedStatementsFor } from '../lib/seed'
import { loginSchema, signupSchema } from '../lib/validation'

export const authRoutes = new Hono<AppBindings>()

authRoutes.get('/status', async (c) => {
  const token = getCookie(c, SESSION_COOKIE)
  const userId = token ? await readSession(token, c.env.AUTH_SECRET) : null

  return c.json({
    /** Whether any account exists yet, which decides the first screen. */
    configured: (await countUsers(c.env.DB)) > 0,
    authenticated: userId !== null,
    // Only ever says whether *you* are an admin, so it is safe on a public route.
    is_admin: userId !== null && (await isAdminUser(c.env.DB, userId, c.env.ADMIN_USERNAMES)),
    // Currency belongs to an account, so there is nothing meaningful to report
    // before sign-in. The client replaces this as soon as it has a session.
    currency_symbol: '৳',
  })
})

/**
 * Creates a new, isolated account: its own settings row and its own copy of the
 * default categories. The account, the settings and all 14 categories are sent
 * as one batch so a half-created account can never exist.
 */
authRoutes.post('/signup', async (c) => {
  const body = signupSchema.safeParse(await c.req.json().catch(() => null))
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? 'Invalid credentials' }, 400)
  }

  const { username, password } = body.data
  const record = await hashPassword(password)

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO users (username, password_hash, password_salt, password_iterations)
         VALUES (?1, ?2, ?3, ?4)`,
      ).bind(username, record.hash, record.salt, record.iterations),
      ...seedStatementsFor(c.env.DB, username),
    ])
  } catch (error) {
    if (/UNIQUE/i.test(String(error))) {
      return c.json({ error: 'That username is already taken' }, 409)
    }
    throw error
  }

  const user = await findUserByUsername(c.env.DB, username)
  if (!user) return c.json({ error: 'Could not create the account' }, 500)

  setSessionCookie(c, await issueSession(user.id, c.env.AUTH_SECRET))
  return c.json({ ok: true }, 201)
})

authRoutes.post('/login', async (c) => {
  const body = loginSchema.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'Username and password are required' }, 400)

  const { username, password } = body.data
  const user = await findUserByUsername(c.env.DB, username)

  if (!user) {
    // Same work as a real check, so a missing account is not faster to probe.
    await verifyAgainstAbsentUser(password)
    return c.json({ error: 'Incorrect username or password' }, 401)
  }

  const lockout = await checkLockout(c.env.DB, user.id)
  if (lockout.locked) {
    return c.json(
      { error: `Too many attempts. Try again in ${Math.ceil(lockout.retryAfterSeconds / 60)} min.` },
      429,
    )
  }

  const ok = await verifyPassword(password, {
    hash: user.password_hash,
    salt: user.password_salt,
    iterations: user.password_iterations,
  })

  if (!ok) {
    await registerFailedAttempt(c.env.DB, user.id)
    // One message for a wrong username and a wrong password alike.
    return c.json({ error: 'Incorrect username or password' }, 401)
  }

  await clearFailedAttempts(c.env.DB, user.id)
  setSessionCookie(c, await issueSession(user.id, c.env.AUTH_SECRET))
  return c.json({ ok: true })
})

authRoutes.post('/logout', (c) => {
  clearSessionCookie(c)
  return c.json({ ok: true })
})
