PRAGMA foreign_keys = ON;
CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  last_sent_at INTEGER NOT NULL DEFAULT 0,
  challenge_expires_at INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  invite_id TEXT NOT NULL REFERENCES invites(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  invite_id TEXT REFERENCES invites(id),
  preview_key TEXT NOT NULL,
  original_key TEXT,
  filename TEXT,
  caption TEXT NOT NULL,
  alt TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  CHECK(invite_id IS NOT NULL OR original_key IS NULL)
);
