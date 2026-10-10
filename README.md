# MyLedger

A private money tracker. Log every movement — a ৳1 snack or a monthly salary —
and a running balance updates instantly. Each account gets its own ledger;
accounts never see each other's data.

Built entirely on Cloudflare's free tier: **Pages** (static SPA + Functions),
**Workers** (Hono API), **D1** (SQLite). No paid services required.

**Live:** <https://myledger-fx6.pages.dev> — see
[Deploying for free](#deploying-for-free) for how it is wired up.

---

## Stack

| Layer      | Choice                                              |
| ---------- | --------------------------------------------------- |
| Frontend   | React 18 + Tailwind CSS, Vite                       |
| Charts     | Recharts (lazy-loaded)                              |
| API        | Hono on Cloudflare Pages Functions                  |
| Database   | Cloudflare D1 (SQLite) + triggers                   |
| Auth       | PBKDF2 password hash + signed JWT session cookie     |
| Deploy     | Wrangler CLI                                        |

The SPA and the API ship from **one Pages project**, so everything is
same-origin. That is what lets the session live in a plain `HttpOnly;
SameSite=Lax` cookie instead of something cross-site.

---

## Features

**Core**

- **Quick add** — big numeric keypad-friendly amount field, one-tap category
  chips, date defaults to today. The category you used last is remembered per
  type, so logging a repeat expense is amount → tap → done.
- **Current balance** — pinned to the top of the dashboard, green when positive
  and red when negative. Kept exact by SQLite triggers, not by recomputing on
  every read.
- **Categories** — create, rename, recolor, pick an emoji, and delete,
  separately for expense and earning.
- **History** — reverse-chronological, grouped by date with a per-day net,
  filterable by type / category / date range, searchable by note, with
  "Load more" pagination. Every entry is editable and deletable.
- **Reports** — donut breakdown by category, bar/line trend over time, with a
  Day / Week / Month / Year toggle and a summary strip (spent, earned, net).
- **Sign-up / sign-in** — anyone can create an account from the sign-up screen
  (username, password, confirm); signing in takes username + password, and a
  link under the button switches between the two. Both password fields have an
  eye toggle. **Each account gets its own private ledger** — categories,
  transactions, budgets and balance are never shared.

**Also included**

- **Budgets** — per-expense-category monthly limit with a progress bar that
  turns amber near the limit and red when exceeded.
- **Insights** — text callouts like "Groceries is up 32% compared to last month."
- **CSV export** — whole ledger or any date range.
- **Dark mode** — toggle in the header, remembered across reloads.
- **PWA** — installable, and the shell opens offline (API is never cached).
- **Mobile-first** — bottom tab bar, safe-area insets, 16px inputs to stop iOS
  zoom-on-focus.

---

## Local development

Requires Node 18+ and a Cloudflare account only when you deploy.

```bash
npm install
cp .dev.vars.example .dev.vars    # AUTH_SECRET for signing sessions
npm run db:migrate                # creates the local D1 database + seed data
npm run dev                       # API on :8788, Vite on :5173
```

Open <http://localhost:5173>. A fresh database has no accounts, so the sign-up
screen leads; once one exists, sign-in leads and `Sign up` sits under the button.

`npm run dev` runs both processes together; Vite proxies `/api` to the
`wrangler pages dev` server so the browser sees a single origin.

> **Note on `.dev.vars`** — it is gitignored. Never commit it.

### Useful scripts

| Command                   | What it does                                    |
| ------------------------- | ----------------------------------------------- |
| `npm run dev`             | API + web dev servers together                  |
| `npm run typecheck`       | Type-check app, worker, and config projects     |
| `npm run build`           | Type-check then build the SPA to `dist/`        |
| `npm run db:migrate`      | Apply migrations to the **local** D1            |
| `npm run db:migrate:remote` | Apply migrations to the **remote** D1         |

To inspect the local database directly:

```bash
npx wrangler d1 execute myledger-db --local \
  --command "SELECT * FROM transactions ORDER BY id DESC LIMIT 10;"
```

---

## Deploying for free

Roughly five minutes. Run everything from the project root.

### 1. Log in to Cloudflare

```bash
npx wrangler login
```

### 2. Create the D1 database

```bash
npx wrangler d1 create myledger-db
```

> **Already done for this deployment** — the database, Pages project, and
> `AUTH_SECRET` all exist, and `wrangler.toml` holds the real `database_id`
> (`b20b360f-…-44673afa7a78`). To redeploy after a code change you only need
> `npm run deploy`. The remaining steps document a from-scratch setup.

```toml
[[d1_databases]]
binding = "DB"
database_name = "myledger-db"
database_id = "b20b360f-2362-47fb-9a48-44673afa7a78"
migrations_dir = "migrations"
```

> Keep the binding named `DB`. The Worker reads it as `env.DB` everywhere, so
> renaming it breaks every query. Wrangler's own output suggests copying a
> snippet with a different binding name — ignore that part.
>
> `database_id` is an identifier, not a credential. It is safe to commit; it is
> only usable alongside an authenticated wrangler session.

### 3. Apply the schema to the remote database

```bash
npm run db:migrate:remote
```

This creates the tables, all triggers, and the 14 default categories
(9 expense, 5 earning).

### 4. Create the Pages project

```bash
npx wrangler pages project create myledger
```

The project name must match `name` in `wrangler.toml` (currently `myledger`),
because that is what `npm run deploy` targets. If you rename it, update both.

### 5. Set the session secret

```bash
openssl rand -base64 48 | npx wrangler pages secret put AUTH_SECRET --project-name myledger
```

This signs the session cookie. `AUTH_SECRET` is **required** — the API returns a
clear error at request time if it is missing, rather than silently issuing
unsigned sessions.

### 6. Build and deploy

```bash
npm run deploy
```

`npm run deploy` runs `npm run build` (which type-checks first) and then
`wrangler pages deploy`, which uploads `dist/` **and** the `functions/`
directory together.

Wrangler prints a hash-prefixed URL such as
`https://58db8363.myledger-fx6.pages.dev`. That is the immutable URL for *that
one build*, not your site. The stable address is the project domain:

```
https://myledger-fx6.pages.dev
```

(The `-fx6` suffix is Cloudflare's, because the plain `myledger` subdomain was
already taken.)

### 7. Lock it down

Open the site and create your account on the first-run screen — that form only
appears while no account exists. From then on every request needs a session.

Since `*.pages.dev` hostnames are guessable, consider adding:

- A **Cloudflare Access** policy (Zero Trust, free for up to 50 users), and/or
- **Bot Fight Mode** in the Cloudflare dashboard.

The built-in password gate is what keeps random visitors out; the above adds a
second layer.

### Redeploying later

```bash
npm run deploy
```

Only re-run `npm run db:migrate:remote` when you add a new file to
`migrations/`.

> **Production branch gotcha.** The Pages project's production branch was set to
> `alvee` during setup, and deployments only count as *production* when the
> branch matches. Direct CLI uploads are fine — wrangler targets the production
> branch and the deploy lands on `myledger-fx6.pages.dev`. But if you later
> connect a Git repository and its default branch is `main`, pushes would create
> **preview** deployments instead of updating your live site. In that case either
> rename the production branch to `main` in the dashboard
> (Settings → Builds & deployments) or deploy with
> `wrangler pages deploy dist --project-name myledger --branch alvee`.

---

## API reference

All routes are under `/api`. Everything except `/api/auth/*` and `/api/health`
requires a session cookie.

**Auth**

| Method | Route              | Purpose                                       |
| ------ | ------------------ | --------------------------------------------- |
| GET    | `/auth/status`     | Do any accounts exist? Am I authenticated?    |
| POST   | `/auth/signup`     | Create an account `{username, password}`      |
| POST   | `/auth/login`      | Sign in `{username, password}`, returns a session cookie |
| POST   | `/auth/logout`     | Clear the cookie                              |

Usernames are folded to lower case and trimmed before comparison, so `Alvee`,
`alvee`, and `  ALVEE  ` are the same account. Sign-up accepts
`3-32` characters of `a-z 0-9 . _ -`; passwords need at least 4 characters.
Signing up with a taken username returns `409`.

A failed sign-in returns a single `Incorrect username or password` message for
both a wrong username and a wrong password, always runs the password hash (even
against a placeholder when no such account exists), so neither the response body
nor the response time reveals which usernames are registered.

**Every route below is scoped to the signed-in account.** The session cookie
carries the account id, and each query filters on it, so an id belonging to
someone else reads as `404 Not Found` rather than leaking existence.

**Transactions**

| Method | Route                        | Purpose                                            |
| ------ | ---------------------------- | -------------------------------------------------- |
| GET    | `/transactions`              | List; supports `from` `to` `type` `category_id` `search` `limit` `offset` |
| POST   | `/transactions`              | Create                                             |
| PATCH  | `/transactions/:id`          | Update any field                                   |
| DELETE | `/transactions/:id`          | Delete (returns the new balance)                   |

**Categories**

| Method | Route                          | Purpose                                          |
| ------ | ------------------------------ | ------------------------------------------------ |
| GET    | `/categories?type=`            | List with usage counts and totals                |
| POST   | `/categories`                  | Create                                           |
| PATCH  | `/categories/:id`              | Rename / recolor / re-icon                       |
| DELETE | `/categories/:id?reassign=true`| Delete; refuses while in use unless reassigning  |

**Reports**

| Method | Route                              | Purpose                              |
| ------ | ---------------------------------- | ------------------------------------ |
| GET    | `/reports/summary`                 | Totals + net + current balance       |
| GET    | `/reports/by-category`             | Donut data with share percentages    |
| GET    | `/reports/timeseries?bucket=`      | Trend data, bucketed by `day`/`week`/`month`/`year` |
| GET    | `/reports/insights?month=`         | Month-over-month text callouts       |

**Other**

| Method      | Route                     | Purpose                             |
| ----------- | ------------------------- | ----------------------------------- |
| GET         | `/settings`               | Balance, currency symbol            |
| PATCH       | `/settings`               | Update opening balance / symbol     |
| POST        | `/settings/recalculate`   | Rebuild the cached balance          |
| PUT         | `/settings/password`      | Change the password                 |
| GET/PUT/DEL | `/budgets`, `/budgets/:categoryId` | Monthly limits            |
| GET         | `/export/csv`             | CSV download — accepts the same date filters |

---

## How the balance stays correct

`settings.current_balance` is a **derived** value: `opening_balance + net(that
account's transactions)`. Rather than recomputing it on every dashboard load,
three triggers on `transactions` (after insert, update, delete) apply the delta
atomically, scoped by `NEW.user_id` / `OLD.user_id`. A single write can never
leave the cached balance inconsistent with the ledger — and one account's
activity can never move another's balance.

If anything ever does drift, `POST /api/settings/recalculate` (or the
**Recalculate balance** button in Settings) rebuilds it from the transaction log
in one statement.

Because the trigger approach can drift if someone edits the database by hand,
money is rounded to 2 decimals on every write *and* in every aggregate, which
keeps float error well below a cent.

`transactions.type` is denormalised onto the row, and the API validates it
against the category's type on every create and update — so an expense can never
be filed under "Salary".

---

## Project layout

```
functions/
  api/[[path]].ts       # mounts the whole Hono API at /api/*
  [[path]].ts           # SPA fallback for client-side routes
worker/
  app.ts                # route table + auth middleware
  routes/               # auth, transactions, categories, reports, settings, budgets, export
  lib/                  # auth (PBKDF2 + JWT), queries, validation (zod), helpers
migrations/
  0001_init.sql         # schema, triggers, seed categories
  0002_username.sql     # adds the account username
  0003_multiuser.sql    # users table + per-account scoping
shared/
  types.ts              # types imported by BOTH the worker and the SPA
src/
  pages/                # Dashboard, Transactions, Reports, Categories, Settings
  components/           # Shell, forms, charts, toasts, UI primitives
  lib/                  # api client, date/money/theme helpers
  state/                # LedgerProvider (settings + categories context)
public/                 # manifest, service worker, icons, robots.txt
```

---

## Notes and trade-offs

- **Sessions are stateless JWTs (30 days).** Logging out clears the cookie, but
  a token copied out of the browser stays valid until it expires. That is the
  normal trade-off for a stateless design; the Settings page lets you change the
  password at any time.
- **Offline reads only.** The service worker caches the app shell so it opens
  without a connection, but `/api/*` is always fetched from the network — you
  are never shown a stale balance. Offline *writes* are not queued; that would
  need IndexedDB plus a replay path.
- **Rate limiting** is 10 failed sign-ins → 15-minute lockout, tracked per
  account in D1, so one user cannot lock another out. It is not per-IP; for a
  personal app behind an unguessable URL that is proportionate.
- **Anyone can sign up, and ledgers are fully isolated.** A new account is
  created with its own settings row and its own copy of the 14 default
  categories; it sees nothing belonging to anyone else. There is no shared
  ledger and no way to view another account's data.
- **A password set before the username column existed counts as unconfigured.**
  The sign-up screen reappears so the owner can re-establish credentials. The
  migration adopts the old account as user 1, so transactions, categories,
  budgets and the balance are untouched.
- **The username is never displayed on the sign-in screen.** Echoing it would
  hand it to anyone who finds the URL.
- **Receipt photos (R2) and web-push reminders are not implemented.** Both need
  extra bindings and setup that push past the "stay on the free tier, keep it
  simple" brief.
