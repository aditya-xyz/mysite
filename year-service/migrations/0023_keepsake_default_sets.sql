CREATE TABLE keepsake_defaults (
 year INTEGER PRIMARY KEY REFERENCES editions(year),
 revision TEXT NOT NULL,
 frames_json TEXT NOT NULL,
 created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
--> statement-breakpoint
ALTER TABLE print_orders ADD COLUMN default_artwork_key TEXT;
--> statement-breakpoint
ALTER TABLE print_orders ADD COLUMN default_revision TEXT;
--> statement-breakpoint
ALTER TABLE print_orders ADD COLUMN card_count INTEGER NOT NULL DEFAULT 1 CHECK(card_count IN (1,2));
