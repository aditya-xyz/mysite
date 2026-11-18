-- Live grants are empty by default. A grant pins the exact household identity.
CREATE TABLE live_gift_permissions (
 year INTEGER NOT NULL REFERENCES editions(year), invitation_id TEXT NOT NULL REFERENCES invites(id),
 person_id TEXT NOT NULL, member_ids TEXT NOT NULL,
 postcard_enabled INTEGER NOT NULL DEFAULT 0 CHECK(postcard_enabled IN (0,1)),
 mug_enabled INTEGER NOT NULL DEFAULT 0 CHECK(mug_enabled IN (0,1)),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), expires_at INTEGER NOT NULL,
 PRIMARY KEY(year,invitation_id)
);
--> statement-breakpoint
-- Only an explicit guest checkout can create an intent. Existing simulated
-- orders and automatic postcard fallbacks never gain one retroactively.
CREATE TABLE live_gift_orders (
 order_id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('postcard','mug')),
 year INTEGER NOT NULL, invitation_id TEXT NOT NULL,
 max_cents INTEGER NOT NULL CHECK(max_cents>0 AND max_cents<=CASE kind WHEN 'postcard' THEN 1000 ELSE 2500 END),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','working','draft','submitting','submitted','review','unknown')),
 provider_id TEXT, payload_json TEXT, quote_json TEXT, error TEXT,
 asset_token_hash TEXT UNIQUE, asset_expires_at INTEGER, lease_until INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), updated_at INTEGER NOT NULL DEFAULT(unixepoch()),
 UNIQUE(year,invitation_id,kind),
 FOREIGN KEY(year,invitation_id) REFERENCES live_gift_permissions(year,invitation_id)
);
