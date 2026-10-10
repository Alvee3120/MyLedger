-- ===========================================================================
-- MyLedger — multi-user
-- ===========================================================================
-- Turns the single-account ledger into one ledger per account. Signing up now
-- creates a brand new, isolated account: a user can only ever see their own
-- categories, transactions, budgets and balance.
--
-- Existing data is ADOPTED, not discarded. Any account created before this
-- migration becomes user 1 and keeps every category, transaction and budget it
-- already had, along with its password hash and running balance.
--
-- Every table needs rebuilding rather than a plain ALTER:
--   * categories — UNIQUE (name, type) has to become UNIQUE (user_id, name,
--                  type), otherwise two accounts could not both have "Food".
--   * settings   — its credentials move to `users`, and it becomes one row per
--                  account instead of a single pinned row.
--   * transactions/budgets — gain user_id, rebuilt alongside for consistency.
--
-- WHY THE STAGING TABLES
-- Rather than dropping and renaming tables that reference each other (which
-- trips foreign key checks mid-migration), the rows are parked in plain
-- staging tables that declare no foreign keys at all. The real tables are then
-- dropped and recreated empty, in dependency order, and the rows are copied
-- back in only once every table and FK already exists. No statement ever runs
-- against a dangling reference.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  username            TEXT    NOT NULL,
  password_hash       TEXT    NOT NULL,
  password_salt       TEXT    NOT NULL,
  password_iterations INTEGER NOT NULL,
  failed_attempts     INTEGER NOT NULL DEFAULT 0,
  locked_until        TEXT,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Usernames are compared lower-cased, so a plain unique index is sufficient.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username);

-- ---------------------------------------------------------------------------
-- 2. Adopt the pre-multi-user account, if there is one
-- ---------------------------------------------------------------------------
-- A fresh install has no username and nothing is copied; the first sign-up
-- creates user 1 and seeds its own categories.
INSERT INTO users (id, username, password_hash, password_salt, password_iterations,
                   failed_attempts, locked_until)
SELECT 1,
       username,
       password_hash,
       password_salt,
       COALESCE(password_iterations, 100000),
       COALESCE(failed_attempts, 0),
       locked_until
  FROM settings
 WHERE id = 1
   AND username      IS NOT NULL
   AND password_hash IS NOT NULL
   AND password_salt IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Park the existing rows (no constraints, so nothing can object)
-- ---------------------------------------------------------------------------
CREATE TABLE stg_categories AS SELECT * FROM categories;
CREATE TABLE stg_transactions AS SELECT * FROM transactions;
CREATE TABLE stg_budgets AS SELECT * FROM budgets;

-- settings keeps only the columns that survive; credentials now live in `users`.
CREATE TABLE stg_settings AS
SELECT id, opening_balance, current_balance, currency_symbol, updated_at FROM settings;

-- ---------------------------------------------------------------------------
-- 4. Drop the old tables (children first), then recreate with user_id
-- ---------------------------------------------------------------------------
-- Dropping a table also drops its indexes and triggers, so the old balance
-- triggers disappear here and are recreated scoped by user in step 6.
DROP TABLE transactions;
DROP TABLE budgets;
DROP TABLE categories;
DROP TABLE settings;

CREATE TABLE categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  type       TEXT    NOT NULL CHECK (type IN ('expense', 'earning')),
  color      TEXT    NOT NULL DEFAULT '#64748b',
  icon       TEXT,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, name, type)
);

CREATE TABLE transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type        TEXT    NOT NULL CHECK (type IN ('expense', 'earning')),
  amount      REAL    NOT NULL CHECK (amount > 0),
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  note        TEXT,
  date        TEXT    NOT NULL DEFAULT (date('now')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE budgets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL UNIQUE REFERENCES categories (id) ON DELETE CASCADE,
  amount      REAL    NOT NULL CHECK (amount > 0),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE settings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  opening_balance REAL    NOT NULL DEFAULT 0,
  current_balance REAL    NOT NULL DEFAULT 0,
  currency_symbol TEXT    NOT NULL DEFAULT '৳',
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- 5. Copy the parked rows back, owned by user 1
-- ---------------------------------------------------------------------------
-- Guarded by EXISTS: on a fresh install there is no user 1, so the untouched
-- seed categories are left behind and the first sign-up seeds its own.
INSERT INTO categories (id, user_id, name, type, color, icon, is_default, created_at)
SELECT id, 1, name, type, color, icon, is_default, created_at
  FROM stg_categories
 WHERE EXISTS (SELECT 1 FROM users WHERE id = 1);

INSERT INTO transactions (id, user_id, type, amount, category_id, note, date, created_at)
SELECT id, 1, type, amount, category_id, note, date, created_at
  FROM stg_transactions
 WHERE EXISTS (SELECT 1 FROM users WHERE id = 1);

INSERT INTO budgets (id, user_id, category_id, amount, created_at)
SELECT id, 1, category_id, amount, created_at
  FROM stg_budgets
 WHERE EXISTS (SELECT 1 FROM users WHERE id = 1);

INSERT INTO settings (user_id, opening_balance, current_balance, currency_symbol, updated_at)
SELECT 1, opening_balance, current_balance, currency_symbol, updated_at
  FROM stg_settings
 WHERE id = 1
   AND EXISTS (SELECT 1 FROM users WHERE id = 1);

DROP TABLE stg_categories;
DROP TABLE stg_transactions;
DROP TABLE stg_budgets;
DROP TABLE stg_settings;

-- ---------------------------------------------------------------------------
-- 6. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_transactions_date      ON transactions (date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category  ON transactions (category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type      ON transactions (type);
-- List and report queries are always filtered by owner, so user_id leads.
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions (user_id, date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_categories_user        ON categories (user_id, type);
CREATE INDEX IF NOT EXISTS idx_budgets_user           ON budgets (user_id);

-- ---------------------------------------------------------------------------
-- 7. Balance triggers, now scoped to the owning account
-- ---------------------------------------------------------------------------
-- transactions.user_id is immutable in the API, so the update trigger can
-- safely settle both the old and new contribution against NEW.user_id.
CREATE TRIGGER IF NOT EXISTS trg_transactions_after_insert
AFTER INSERT ON transactions
BEGIN
  UPDATE settings
     SET current_balance = ROUND(current_balance
           + CASE WHEN NEW.type = 'earning' THEN NEW.amount ELSE -NEW.amount END, 2),
         updated_at = datetime('now')
   WHERE user_id = NEW.user_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_transactions_after_delete
AFTER DELETE ON transactions
BEGIN
  UPDATE settings
     SET current_balance = ROUND(current_balance
           - CASE WHEN OLD.type = 'earning' THEN OLD.amount ELSE -OLD.amount END, 2),
         updated_at = datetime('now')
   WHERE user_id = OLD.user_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_transactions_after_update
AFTER UPDATE ON transactions
BEGIN
  UPDATE settings
     SET current_balance = ROUND(current_balance
           - CASE WHEN OLD.type = 'earning' THEN OLD.amount ELSE -OLD.amount END
           + CASE WHEN NEW.type = 'earning' THEN NEW.amount ELSE -NEW.amount END, 2),
         updated_at = datetime('now')
   WHERE user_id = NEW.user_id;
END;
