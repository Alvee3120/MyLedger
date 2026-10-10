-- ===========================================================================
-- MyLedger — initial schema
-- ===========================================================================
-- Money is stored as REAL per the project spec. Every value written by the API
-- is rounded to 2 decimals first, and every aggregate is rounded on read, so
-- float drift stays well below a cent for realistic personal-finance volumes.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  type       TEXT    NOT NULL CHECK (type IN ('expense', 'earning')),
  color      TEXT    NOT NULL DEFAULT '#64748b',
  icon       TEXT,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (name, type)
);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT    NOT NULL CHECK (type IN ('expense', 'earning')),
  amount      REAL    NOT NULL CHECK (amount > 0),
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  note        TEXT,
  date        TEXT    NOT NULL DEFAULT (date('now')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_date     ON transactions (date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions (category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type     ON transactions (type);

-- ---------------------------------------------------------------------------
-- settings — a single row, id is pinned to 1
-- ---------------------------------------------------------------------------
-- current_balance is DERIVED: opening_balance + net(transactions). It is kept
-- up to date by the triggers below so that reads are O(1). If it ever drifts,
-- POST /api/settings/recalculate rebuilds it from scratch.
CREATE TABLE IF NOT EXISTS settings (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  opening_balance   REAL    NOT NULL DEFAULT 0,
  current_balance   REAL    NOT NULL DEFAULT 0,
  currency_symbol   TEXT    NOT NULL DEFAULT '৳',
  password_hash     TEXT,
  password_salt     TEXT,
  password_iterations INTEGER,
  failed_attempts   INTEGER NOT NULL DEFAULT 0,
  locked_until      TEXT,
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings (id) VALUES (1);

-- ---------------------------------------------------------------------------
-- budgets — optional monthly limit per expense category
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budgets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL UNIQUE REFERENCES categories (id) ON DELETE CASCADE,
  amount      REAL    NOT NULL CHECK (amount > 0),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Triggers: keep settings.current_balance in sync with transactions
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_transactions_after_insert
AFTER INSERT ON transactions
BEGIN
  UPDATE settings
     SET current_balance = ROUND(current_balance
           + CASE WHEN NEW.type = 'earning' THEN NEW.amount ELSE -NEW.amount END, 2),
         updated_at = datetime('now')
   WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS trg_transactions_after_delete
AFTER DELETE ON transactions
BEGIN
  UPDATE settings
     SET current_balance = ROUND(current_balance
           - CASE WHEN OLD.type = 'earning' THEN OLD.amount ELSE -OLD.amount END, 2),
         updated_at = datetime('now')
   WHERE id = 1;
END;

-- An UPDATE is handled by removing the old contribution and adding the new one,
-- which also covers a transaction flipping between expense and earning.
CREATE TRIGGER IF NOT EXISTS trg_transactions_after_update
AFTER UPDATE ON transactions
BEGIN
  UPDATE settings
     SET current_balance = ROUND(current_balance
           - CASE WHEN OLD.type = 'earning' THEN OLD.amount ELSE -OLD.amount END
           + CASE WHEN NEW.type = 'earning' THEN NEW.amount ELSE -NEW.amount END, 2),
         updated_at = datetime('now')
   WHERE id = 1;
END;

-- ---------------------------------------------------------------------------
-- Seed: default categories
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO categories (name, type, color, icon, is_default) VALUES
  ('Food',              'expense', '#ef4444', '🍽️', 1),
  ('Transportation',    'expense', '#3b82f6', '🚌', 1),
  ('Shopping',          'expense', '#a855f7', '🛍️', 1),
  ('Fish & Meat',       'expense', '#ec4899', '🐟', 1),
  ('Groceries',         'expense', '#22c55e', '🛒', 1),
  ('Bills & Utilities', 'expense', '#eab308', '💡', 1),
  ('Health',            'expense', '#14b8a6', '💊', 1),
  ('Entertainment',     'expense', '#f97316', '🎬', 1),
  ('Others',            'expense', '#64748b', '📦', 0),
  ('Salary',            'earning', '#16a34a', '💼', 1),
  ('Freelance',         'earning', '#0ea5e9', '🧑‍💻', 1),
  ('Business',          'earning', '#8b5cf6', '📈', 1),
  ('Gift',              'earning', '#f43f5e', '🎁', 1),
  ('Others',            'earning', '#64748b', '📦', 0);
