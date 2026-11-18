CREATE TABLE sms_test_invites_new (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  session_hash TEXT UNIQUE,
  phone TEXT,
  country TEXT NOT NULL CHECK (country IN ('IN', 'NL', 'US')),
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

INSERT INTO sms_test_invites_new (
  id, token_hash, session_hash, phone, country, phone_hint, created_at, expires_at,
  redeemed_at, revoked_at, verified_at, last_send_at, sends, attempts, sent_at,
  verification_sid, challenge_expires_at
)
SELECT
  id, token_hash, session_hash, phone, country, phone_hint, created_at, expires_at,
  redeemed_at, revoked_at, verified_at, last_send_at, sends, attempts, sent_at,
  verification_sid, challenge_expires_at
FROM sms_test_invites;

DROP TABLE sms_test_invites;
ALTER TABLE sms_test_invites_new RENAME TO sms_test_invites;
CREATE INDEX sms_test_active_phone ON sms_test_invites(phone, expires_at);
