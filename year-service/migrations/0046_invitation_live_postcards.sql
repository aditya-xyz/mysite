CREATE TABLE live_gift_orders_next (
 order_id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('postcard','mug')),
 year INTEGER NOT NULL REFERENCES editions(year), invitation_id TEXT NOT NULL REFERENCES invites(id),
 max_cents INTEGER NOT NULL CHECK(max_cents>0 AND max_cents<=CASE kind WHEN 'postcard' THEN 1000 ELSE 2500 END),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','working','draft','submitting','submitted','review','unknown')),
 provider_id TEXT, payload_json TEXT, quote_json TEXT, error TEXT,
 asset_token_hash TEXT UNIQUE, asset_expires_at INTEGER, lease_until INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), updated_at INTEGER NOT NULL DEFAULT(unixepoch()),
 allowance_reset_at INTEGER, mug_person_id TEXT, mug_member_ids TEXT,
 postcard_person_id TEXT, postcard_member_ids TEXT
);
--> statement-breakpoint
INSERT INTO live_gift_orders_next(order_id,kind,year,invitation_id,max_cents,state,provider_id,payload_json,quote_json,error,asset_token_hash,asset_expires_at,lease_until,created_at,updated_at,allowance_reset_at,mug_person_id,mug_member_ids,postcard_person_id,postcard_member_ids)
SELECT l.order_id,l.kind,l.year,l.invitation_id,l.max_cents,l.state,l.provider_id,l.payload_json,l.quote_json,l.error,l.asset_token_hash,l.asset_expires_at,l.lease_until,l.created_at,l.updated_at,l.allowance_reset_at,l.mug_person_id,l.mug_member_ids,g.person_id,g.member_ids
FROM live_gift_orders l LEFT JOIN live_gift_permissions g ON l.kind='postcard' AND g.year=l.year AND g.invitation_id=l.invitation_id;
--> statement-breakpoint
DROP TABLE live_gift_orders;
--> statement-breakpoint
ALTER TABLE live_gift_orders_next RENAME TO live_gift_orders;
--> statement-breakpoint
CREATE UNIQUE INDEX one_active_live_gift_per_invitation
ON live_gift_orders(year,invitation_id,kind) WHERE allowance_reset_at IS NULL;
--> statement-breakpoint
-- The previous Worker can still create a granted postcard during rollout.
CREATE TRIGGER snapshot_legacy_live_postcard AFTER INSERT ON live_gift_orders
WHEN new.kind='postcard' AND new.postcard_person_id IS NULL
BEGIN
 UPDATE live_gift_orders SET
  postcard_person_id=(SELECT person_id FROM live_gift_permissions WHERE year=new.year AND invitation_id=new.invitation_id),
  postcard_member_ids=(SELECT member_ids FROM live_gift_permissions WHERE year=new.year AND invitation_id=new.invitation_id)
 WHERE order_id=new.order_id;
END;
