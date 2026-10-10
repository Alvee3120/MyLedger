-- ===========================================================================
-- MyLedger — add a username to the single account
-- ===========================================================================
-- Signing in now takes a username alongside the password, so an account counts
-- as "configured" only when BOTH exist.
--
-- An install that had a password but no username (everything deployed before
-- this migration) is treated as unconfigured, so the sign-up screen appears
-- again and the owner re-establishes their credentials. Transactions, budgets,
-- categories and the balance are untouched — only the login details change.
--
-- Nullable on purpose: SQLite cannot add a UNIQUE column via ALTER TABLE, and
-- uniqueness is meaningless here because `settings` is pinned to a single row.
-- ===========================================================================

ALTER TABLE settings ADD COLUMN username TEXT;
