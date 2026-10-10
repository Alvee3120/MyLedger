-- ===========================================================================
-- MyLedger — savings pot
-- ===========================================================================
-- Each account gets a second balance, `savings_balance`, alongside the main
-- `current_balance`. Money moves into savings (a deposit) or leaves it again
-- when it is spent (a spend).
--
--   deposit : current_balance -= amount, savings_balance += amount
--   spend   : savings_balance -= amount   (current_balance is untouched)
--
-- The "can I afford this?" guards live in the API, which reads the balances
-- before writing. The triggers below only keep the two stored totals correct no
-- matter which statement wrote the row — the same division of labour the
-- existing transaction balance triggers use.
--
-- Entries are immutable apart from deletion; the delete triggers reverse the
-- effect, so a mistaken entry can always be undone exactly.
-- ===========================================================================

ALTER TABLE settings ADD COLUMN savings_balance REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS savings_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL CHECK (kind IN ('deposit', 'spend')),
  amount     REAL    NOT NULL CHECK (amount > 0),
  note       TEXT,
  date       TEXT    NOT NULL DEFAULT (date('now')),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- The savings page lists newest-first for one owner, so user_id leads.
CREATE INDEX IF NOT EXISTS idx_savings_user_date ON savings_entries (user_id, date DESC, id DESC);

CREATE TRIGGER IF NOT EXISTS trg_savings_after_insert_deposit
AFTER INSERT ON savings_entries
WHEN NEW.kind = 'deposit'
BEGIN
  UPDATE settings
     SET current_balance = ROUND(current_balance - NEW.amount, 2),
         savings_balance = ROUND(savings_balance + NEW.amount, 2),
         updated_at = datetime('now')
   WHERE user_id = NEW.user_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_savings_after_insert_spend
AFTER INSERT ON savings_entries
WHEN NEW.kind = 'spend'
BEGIN
  UPDATE settings
     SET savings_balance = ROUND(savings_balance - NEW.amount, 2),
         updated_at = datetime('now')
   WHERE user_id = NEW.user_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_savings_after_delete_deposit
AFTER DELETE ON savings_entries
WHEN OLD.kind = 'deposit'
BEGIN
  UPDATE settings
     SET current_balance = ROUND(current_balance + OLD.amount, 2),
         savings_balance = ROUND(savings_balance - OLD.amount, 2),
         updated_at = datetime('now')
   WHERE user_id = OLD.user_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_savings_after_delete_spend
AFTER DELETE ON savings_entries
WHEN OLD.kind = 'spend'
BEGIN
  UPDATE settings
     SET savings_balance = ROUND(savings_balance + OLD.amount, 2),
         updated_at = datetime('now')
   WHERE user_id = OLD.user_id;
END;
