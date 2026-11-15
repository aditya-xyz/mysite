CREATE TABLE contact_address_checks (
 id TEXT PRIMARY KEY, draft_key TEXT NOT NULL, actor TEXT NOT NULL,
 address_json TEXT NOT NULL, provider TEXT NOT NULL CHECK(provider IN ('google','local_mock')),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX contact_address_checks_expiry ON contact_address_checks(expires_at);
CREATE TABLE contact_create_requests (
 draft_key TEXT PRIMARY KEY, actor TEXT NOT NULL, request_hash TEXT NOT NULL,
 person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE
);
