CREATE TABLE sms_test_invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  session_hash TEXT UNIQUE,
  phone TEXT,
  country TEXT NOT NULL CHECK (country IN ('IN', 'NL')),
  phone_hint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  redeemed_at INTEGER,
  revoked_at INTEGER,
  verified_at INTEGER,
  last_send_at INTEGER NOT NULL DEFAULT 0,
  sends INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER,
  verification_sid TEXT,
  challenge_expires_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX sms_test_active_phone ON sms_test_invites(phone, expires_at);
