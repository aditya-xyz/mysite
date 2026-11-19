-- Keep the original fulfillment record and allow one active intent per gift.
CREATE TABLE live_gift_orders_next (
 order_id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('postcard','mug')),
 year INTEGER NOT NULL, invitation_id TEXT NOT NULL,
 max_cents INTEGER NOT NULL CHECK(max_cents>0 AND max_cents<=CASE kind WHEN 'postcard' THEN 1000 ELSE 2500 END),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','working','draft','submitting','submitted','review','unknown')),
 provider_id TEXT, payload_json TEXT, quote_json TEXT, error TEXT,
 asset_token_hash TEXT UNIQUE, asset_expires_at INTEGER, lease_until INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), updated_at INTEGER NOT NULL DEFAULT(unixepoch()),
 allowance_reset_at INTEGER,
 FOREIGN KEY(year,invitation_id) REFERENCES live_gift_permissions(year,invitation_id)
);
--> statement-breakpoint
INSERT INTO live_gift_orders_next(order_id,kind,year,invitation_id,max_cents,state,provider_id,payload_json,quote_json,error,asset_token_hash,asset_expires_at,lease_until,created_at,updated_at)
SELECT order_id,kind,year,invitation_id,max_cents,state,provider_id,payload_json,quote_json,error,asset_token_hash,asset_expires_at,lease_until,created_at,updated_at FROM live_gift_orders;
--> statement-breakpoint
DROP TABLE live_gift_orders;
--> statement-breakpoint
ALTER TABLE live_gift_orders_next RENAME TO live_gift_orders;
--> statement-breakpoint
CREATE UNIQUE INDEX one_active_live_gift_per_invitation
ON live_gift_orders(year,invitation_id,kind) WHERE allowance_reset_at IS NULL;
