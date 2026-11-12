-- Existing and new invitations are explicitly opted out of complimentary mugs.
ALTER TABLE invites ADD COLUMN allow_mug INTEGER NOT NULL DEFAULT 0 CHECK(allow_mug IN (0,1));
--> statement-breakpoint
ALTER TABLE editions ADD COLUMN allow_mug_orders INTEGER NOT NULL DEFAULT 0 CHECK(allow_mug_orders IN (0,1));
